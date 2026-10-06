# ---------------------------------------------------------------------------
# The API as three Lambda functions built from ONE bundle (apps/api/lambda-dist):
#
#   api.handler        HTTP API behind a function URL (payload v2), fronted by CloudFront
#   worker.handler     background jobs from the SQS queue (batch size 1, partial failures)
#   scheduled.handler  nightly retention sweep triggered by EventBridge Scheduler
#
# Deployment model
#   - Terraform owns configuration: runtime, memory, timeouts, roles, environment.
#   - Terraform uploads the bundle only when a function is CREATED. Afterwards the
#     deploy workflow (or `aws lambda update-function-code`) ships new code and
#     Terraform ignores the code hash, so a later `terraform apply` never rolls a
#     deployment back to whatever zip happens to be on the operator's disk.
#   - If apps/api/lambda-dist.zip is missing at create time a tiny placeholder
#     bundle is uploaded instead (api returns 503 until the first real deploy).
#
# Cost: the always-free tier covers 1 M requests and 400,000 GB-seconds per
# month; function URLs and event source mappings have no charge of their own.
# ---------------------------------------------------------------------------

# --- Code bundle --------------------------------------------------------------------

data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.lambda-placeholder.zip"

  source {
    filename = "package.json"
    content  = jsonencode({ type = "module" })
  }

  source {
    filename = "api.mjs"
    content  = <<-EOT
      export const handler = async () => ({
        statusCode: 503,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'NOT_DEPLOYED', message: 'The API bundle has not been deployed yet. Run the deploy workflow.' }),
      });
    EOT
  }

  source {
    filename = "worker.mjs"
    content  = <<-EOT
      // Report every record as failed so SQS retries it once real code is deployed.
      export const handler = async (event) => ({
        batchItemFailures: (event.Records ?? []).map((r) => ({ itemIdentifier: r.messageId })),
      });
    EOT
  }

  source {
    filename = "scheduled.mjs"
    content  = <<-EOT
      export const handler = async () => ({ skipped: true, reason: 'placeholder bundle - deploy the real code' });
    EOT
  }
}

locals {
  lambda_bundle_present = fileexists(var.lambda_zip_path)
  lambda_zip            = local.lambda_bundle_present ? var.lambda_zip_path : data.archive_file.lambda_placeholder.output_path
  lambda_zip_hash       = local.lambda_bundle_present ? filebase64sha256(var.lambda_zip_path) : data.archive_file.lambda_placeholder.output_base64sha256

  api_function_name       = "${local.name}-api"
  worker_function_name    = "${local.name}-worker"
  scheduled_function_name = "${local.name}-scheduled"
}

# --- Environment (see apps/api/.env.example for the contract) ------------------------
# Secrets come from SSM Parameter Store at apply time (ssm.tf). Lambda encrypts
# environment variables at rest with its service key at no charge.

locals {
  lambda_environment = {
    NODE_ENV    = "production"
    LOG_LEVEL   = var.log_level
    TRUST_PROXY = "true"

    # Same origin for browser and API (CloudFront routes /api/* to the function URL)
    WEB_ORIGIN     = local.web_origin
    API_PUBLIC_URL = local.api_public_url

    DATABASE_URL         = data.aws_ssm_parameter.database_url.value
    JWT_SECRET           = data.aws_ssm_parameter.jwt_secret.value
    COOKIE_SECRET        = data.aws_ssm_parameter.cookie_secret.value
    ORIGIN_VERIFY_SECRET = data.aws_ssm_parameter.origin_verify_secret.value

    STORAGE_PROVIDER = "s3"
    S3_BUCKET        = aws_s3_bucket.uploads.bucket
    S3_REGION        = var.aws_region

    TRANSCRIPTION_PROVIDER = "aws"
    TRANSCRIBE_REGION      = var.aws_region
    TRANSCRIBE_LANGUAGE    = var.transcribe_language

    LLM_PROVIDER       = "openrouter"
    OPENROUTER_API_KEY = data.aws_ssm_parameter.openrouter_api_key.value
    OPENROUTER_MODEL   = var.openrouter_model

    EMAIL_PROVIDER = "ses"
    SES_REGION     = var.aws_region
    EMAIL_FROM     = var.email_from

    JOB_QUEUE     = "sqs"
    SQS_QUEUE_URL = aws_sqs_queue.jobs.url
    SQS_REGION    = var.aws_region

    # Jobs run in the worker function; migrations run from the deploy workflow.
    RUN_WORKER_IN_API       = "false"
    RUN_MIGRATIONS_ON_START = "false"
  }
}

# --- Log groups (created first so retention applies from the first invocation) ------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_function_name}"
  retention_in_days = var.log_retention_days

  tags = { Name = local.api_function_name }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${local.worker_function_name}"
  retention_in_days = var.log_retention_days

  tags = { Name = local.worker_function_name }
}

resource "aws_cloudwatch_log_group" "scheduled" {
  name              = "/aws/lambda/${local.scheduled_function_name}"
  retention_in_days = var.log_retention_days

  tags = { Name = local.scheduled_function_name }
}

# --- IAM: building blocks shared by the three execution roles ----------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Recordings/documents and Transcribe output in the uploads bucket
data "aws_iam_policy_document" "uploads_access" {
  statement {
    sid       = "UploadsBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }

  statement {
    sid       = "UploadsBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.uploads.arn]
  }
}

# Notification and invitation emails from the verified SES domain only
data "aws_iam_policy_document" "send_email" {
  statement {
    sid       = "SendEmail"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [local.ses_identity_arn]
  }
}

# Put jobs on the queue (the API always; the worker for follow-up jobs such as transcription polling)
data "aws_iam_policy_document" "enqueue_jobs" {
  statement {
    sid       = "EnqueueJobs"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"]
    resources = [aws_sqs_queue.jobs.arn]
  }
}

# What the SQS event source mapping needs to poll on the worker's behalf
data "aws_iam_policy_document" "consume_jobs" {
  statement {
    sid = "ConsumeJobs"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.jobs.arn]
  }
}

# Amazon Transcribe reads the media and writes the result using the caller's S3 permissions
data "aws_iam_policy_document" "transcribe" {
  statement {
    sid = "Transcribe"
    actions = [
      "transcribe:StartTranscriptionJob",
      "transcribe:GetTranscriptionJob",
      "transcribe:DeleteTranscriptionJob",
    ]
    resources = ["*"] # Transcribe job ARNs are not known in advance
  }
}

# --- IAM: API function ---------------------------------------------------------------------

resource "aws_iam_role" "lambda_api" {
  name               = "${local.name}-lambda-api"
  description        = "Execution role of the ${local.name} HTTP API function"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_api" {
  source_policy_documents = [
    data.aws_iam_policy_document.uploads_access.json,
    data.aws_iam_policy_document.send_email.json,
    data.aws_iam_policy_document.enqueue_jobs.json,
  ]

  statement {
    sid     = "WriteLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      aws_cloudwatch_log_group.api.arn,
      "${aws_cloudwatch_log_group.api.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_api" {
  name   = "app-permissions"
  role   = aws_iam_role.lambda_api.id
  policy = data.aws_iam_policy_document.lambda_api.json
}

# --- IAM: worker function ---------------------------------------------------------------------

resource "aws_iam_role" "lambda_worker" {
  name               = "${local.name}-lambda-worker"
  description        = "Execution role of the ${local.name} background worker function"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_worker" {
  source_policy_documents = [
    data.aws_iam_policy_document.uploads_access.json,
    data.aws_iam_policy_document.send_email.json,
    data.aws_iam_policy_document.enqueue_jobs.json,
    data.aws_iam_policy_document.consume_jobs.json,
    data.aws_iam_policy_document.transcribe.json,
  ]

  statement {
    sid     = "WriteLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      aws_cloudwatch_log_group.worker.arn,
      "${aws_cloudwatch_log_group.worker.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_worker" {
  name   = "app-permissions"
  role   = aws_iam_role.lambda_worker.id
  policy = data.aws_iam_policy_document.lambda_worker.json
}

# --- IAM: scheduled (retention) function ----------------------------------------------------------

resource "aws_iam_role" "lambda_scheduled" {
  name               = "${local.name}-lambda-scheduled"
  description        = "Execution role of the ${local.name} nightly retention function"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_scheduled" {
  # The sweep deletes expired recordings from S3; it shares the API's queue client
  # (JOB_QUEUE=sqs), so it may enqueue follow-up jobs.
  source_policy_documents = [
    data.aws_iam_policy_document.uploads_access.json,
    data.aws_iam_policy_document.enqueue_jobs.json,
  ]

  statement {
    sid     = "WriteLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      aws_cloudwatch_log_group.scheduled.arn,
      "${aws_cloudwatch_log_group.scheduled.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_scheduled" {
  name   = "app-permissions"
  role   = aws_iam_role.lambda_scheduled.id
  policy = data.aws_iam_policy_document.lambda_scheduled.json
}

# --- Functions ------------------------------------------------------------------------------------

resource "aws_lambda_function" "api" {
  function_name = local.api_function_name
  description   = "${local.name} HTTP API (Fastify via function URL, behind CloudFront)"
  role          = aws_iam_role.lambda_api.arn

  filename         = local.lambda_zip
  source_code_hash = local.lambda_zip_hash
  handler          = "api.handler"
  runtime          = "nodejs22.x"
  architectures    = [var.lambda_architecture]
  memory_size      = var.api_memory_mb
  timeout          = var.api_timeout_seconds

  reserved_concurrent_executions = var.api_reserved_concurrency

  environment {
    variables = local.lambda_environment
  }

  # Code is deployed by the workflow; see the header of this file.
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy.lambda_api,
  ]

  tags = { Name = local.api_function_name }
}

resource "aws_lambda_function" "worker" {
  function_name = local.worker_function_name
  description   = "${local.name} background jobs (SQS consumer)"
  role          = aws_iam_role.lambda_worker.arn

  filename         = local.lambda_zip
  source_code_hash = local.lambda_zip_hash
  handler          = "worker.handler"
  runtime          = "nodejs22.x"
  architectures    = [var.lambda_architecture]
  memory_size      = var.worker_memory_mb
  timeout          = var.worker_timeout_seconds

  environment {
    variables = local.lambda_environment
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [
    aws_cloudwatch_log_group.worker,
    aws_iam_role_policy.lambda_worker,
  ]

  tags = { Name = local.worker_function_name }
}

resource "aws_lambda_function" "scheduled" {
  function_name = local.scheduled_function_name
  description   = "${local.name} nightly retention sweep (EventBridge Scheduler)"
  role          = aws_iam_role.lambda_scheduled.arn

  filename         = local.lambda_zip
  source_code_hash = local.lambda_zip_hash
  handler          = "scheduled.handler"
  runtime          = "nodejs22.x"
  architectures    = [var.lambda_architecture]
  memory_size      = var.scheduled_memory_mb
  timeout          = var.scheduled_timeout_seconds

  environment {
    variables = local.lambda_environment
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [
    aws_cloudwatch_log_group.scheduled,
    aws_iam_role_policy.lambda_scheduled,
  ]

  tags = { Name = local.scheduled_function_name }
}

# --- HTTP entry point: function URL (CloudFront is the only intended caller) -------------------

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE" # the API itself enforces X-Origin-Verify; see cdn.tf header
  invoke_mode        = "BUFFERED"
}

# A NONE-auth function URL still needs a resource policy that allows public invocation.
resource "aws_lambda_permission" "api_url_public" {
  statement_id           = "AllowPublicFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# --- Jobs: SQS -> worker --------------------------------------------------------------------------

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn        = aws_sqs_queue.jobs.arn
  function_name           = aws_lambda_function.worker.arn
  enabled                 = true
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.worker_max_concurrency
  }

  depends_on = [aws_iam_role_policy.lambda_worker]
}

# --- Nightly retention: EventBridge Scheduler -> scheduled function --------------------------------

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  description        = "Lets EventBridge Scheduler invoke the ${local.name} retention function"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    sid     = "InvokeRetentionFunction"
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.scheduled.arn,
      "${aws_lambda_function.scheduled.arn}:*",
    ]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "invoke-scheduled-function"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "retention" {
  name        = "${local.name}-retention-sweep"
  group_name  = "default"
  description = "Nightly retention sweep for ${local.name} (deletes expired recordings and transcripts)"
  state       = "ENABLED"

  schedule_expression          = var.retention_schedule_expression
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.scheduled.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ source = "eventbridge-scheduler", task = "retention-sweep" })

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 1
    }
  }

  depends_on = [aws_iam_role_policy.scheduler_invoke]
}
