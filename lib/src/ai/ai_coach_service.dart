import 'package:cloud_functions/cloud_functions.dart';

/// Thrown when [AiCoachService.ask] gets a response it can't make sense of
/// (e.g. the function returned an unexpected shape).
class AiCoachException implements Exception {
  const AiCoachException(this.message);

  final String message;

  @override
  String toString() => 'AiCoachException: $message';
}

/// Calls the `askCoach` Cloud Function to get a coach-voice answer to an
/// athlete's question. Wave 1 of the AI coaching companion.
///
/// Lives in the shared package so the coach app can reuse it later (e.g. for
/// reply-drafting), and is request/response — distinct from [ChatService],
/// which streams a persisted two-party Firestore thread.
class AiCoachService {
  AiCoachService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  /// Ask the coach companion a question; returns the answer text.
  ///
  /// Throws if the call fails (e.g. unauthenticated, or no coach profile).
  Future<String> ask({
    required String coachId,
    required String question,
  }) async {
    final callable = _functions.httpsCallable('askCoach');
    final result = await callable.call(<String, Object?>{
      'coachId': coachId,
      'question': question,
    });
    // Validate the shape rather than blind-casting: a malformed/empty response
    // becomes a typed failure the UI can handle, not an opaque cast error.
    final data = result.data;
    final answer = data is Map ? data['answer'] : null;
    if (answer is! String || answer.isEmpty) {
      throw const AiCoachException('The coach sent back an empty answer.');
    }
    return answer;
  }
}
