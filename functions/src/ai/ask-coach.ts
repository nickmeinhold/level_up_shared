import {AnthropicVertex} from '@anthropic-ai/vertex-sdk';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {getFirestore} from 'firebase-admin/firestore';
import {logger} from 'firebase-functions/v2';
import {buildCoachCorpus} from './corpus';
import {buildSystemBlocks} from './prompt';
import {enforceRateLimit} from './rate-limit';

// Bare Vertex model ID (no @date suffix). Opus 4.8 for dev quality; revisit
// claude-sonnet-4-6 for production once latency/cost are measured. Overridable
// at deploy time (e.g. to swap to Sonnet) without a code change.
const MODEL = process.env.ASK_COACH_MODEL ?? 'claude-opus-4-8';
// Global endpoint: max availability, no regional pricing premium.
const REGION = process.env.ASK_COACH_REGION ?? 'global';

// Cap the athlete's question so a single request can't balloon the (uncached)
// user turn — a cheap first gate before the billable model call.
const MAX_QUESTION_CHARS = 2000;

interface AskCoachRequest {
  coachId?: string;
  question?: string;
}

/**
 * Wave 1 coach-voice companion: an athlete asks a question, and Claude answers
 * grounded in the coach's cached corpus, in the coach's voice.
 *
 * Auth uses Application Default Credentials — inside a Cloud Function that is
 * the function's own service account (needs the "Vertex AI User" role + the
 * Vertex AI API enabled). No API key in the codebase.
 */
export const askCoach = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'request.auth was undefined.');
  }

  const {coachId, question} = (request.data ?? {}) as AskCoachRequest;
  if (!coachId || !question) {
    throw new HttpsError(
      'invalid-argument',
      'coachId and question are required.',
    );
  }
  if (question.length > MAX_QUESTION_CHARS) {
    throw new HttpsError(
      'invalid-argument',
      `question must be ${MAX_QUESTION_CHARS} characters or fewer.`,
    );
  }

  const projectId =
    process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    // Misconfiguration — log the detail, return a generic message.
    logger.error('askCoach: GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT is not set.');
    throw new HttpsError('internal', 'The coach is unavailable right now.');
  }

  try {
    const db = getFirestore();

    // Fail CLOSED on abuse: a per-user cap (transactional, so concurrent calls
    // can't race past it) before the billable model invocation.
    await enforceRateLimit(db, request.auth.uid);

    const corpus = await buildCoachCorpus(db, coachId);

    const client = new AnthropicVertex({projectId, region: REGION});

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemBlocks(corpus),
      messages: [{role: 'user', content: question}],
    });

    const answer = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();

    // Verify the cache actually engaged (zero on repeated calls = a silent
    // invalidator in the corpus prefix).
    logger.log('askCoach usage', {
      coachId,
      inputTokens: response.usage.input_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return {answer};
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    // Log the real error server-side; return a generic message so internal
    // details (Firestore paths, Vertex/ADC/project errors) don't leak.
    logger.error('askCoach failed', e);
    throw new HttpsError('internal', 'The coach is unavailable right now.');
  }
});
