# ---------------------------------------------------------------------------
# Background jobs: one standard SQS queue consumed by the worker Lambda, with a
# dead-letter queue for messages that fail three times. The API enqueues jobs
# (JOB_QUEUE=sqs); delays (transcription polling) use per-message DelaySeconds.
#
# Cost: 1 M SQS requests per month are always free; beyond that USD 0.40 per
# million. Lambda's pollers count as requests, so a quiet queue is still free.
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "jobs_dlq" {
  name                      = "${local.name}-jobs-dlq"
  message_retention_seconds = 1209600 # 14 days - time to inspect and redrive failed jobs
  sqs_managed_sse_enabled   = true

  tags = { Name = "${local.name}-jobs-dlq" }
}

resource "aws_sqs_queue" "jobs" {
  name = "${local.name}-jobs"

  # Lambda recommends at least 6x the function timeout so a message is never
  # redelivered while an invocation is still working on it.
  visibility_timeout_seconds = 6 * var.worker_timeout_seconds
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20     # long polling
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = { Name = "${local.name}-jobs" }
}

# Only the jobs queue may use the DLQ as its dead-letter target.
resource "aws_sqs_queue_redrive_allow_policy" "jobs_dlq" {
  queue_url = aws_sqs_queue.jobs_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.jobs.arn]
  })
}
