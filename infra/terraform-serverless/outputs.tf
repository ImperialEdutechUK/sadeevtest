# ---------------------------------------------------------------------------
# Outputs - `terraform output` after apply. Several of these are the values
# you paste into GitHub repository variables (see github_variables).
# ---------------------------------------------------------------------------

output "web_url" {
  description = "Public URL of the application"
  value       = local.web_origin
}

output "api_url" {
  description = "Public base URL of the API (served through CloudFront on the web domain)"
  value       = local.api_public_url
}

# --- Web / CDN -----------------------------------------------------------------

output "cloudfront_domain_name" {
  description = "CloudFront hostname - point domain_name here (CNAME/ALIAS) if DNS is managed outside Route 53"
  value       = aws_cloudfront_distribution.web.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidations)"
  value       = aws_cloudfront_distribution.web.id
}

output "web_bucket_name" {
  description = "S3 bucket holding the built SPA"
  value       = aws_s3_bucket.web.bucket
}

# --- API / jobs ----------------------------------------------------------------------

output "api_function_url" {
  description = "Lambda function URL of the API. Direct requests are answered with 403 (missing X-Origin-Verify); use api_url instead"
  value       = aws_lambda_function_url.api.function_url
}

output "lambda_function_names" {
  description = "Names of the three functions (the deploy workflow updates their code)"
  value = {
    api       = aws_lambda_function.api.function_name
    worker    = aws_lambda_function.worker.function_name
    scheduled = aws_lambda_function.scheduled.function_name
  }
}

output "lambda_log_groups" {
  description = "CloudWatch log groups of the three functions"
  value = {
    api       = aws_cloudwatch_log_group.api.name
    worker    = aws_cloudwatch_log_group.worker.name
    scheduled = aws_cloudwatch_log_group.scheduled.name
  }
}

output "jobs_queue_url" {
  description = "SQS queue URL for background jobs (SQS_QUEUE_URL)"
  value       = aws_sqs_queue.jobs.url
}

output "jobs_dead_letter_queue_url" {
  description = "SQS dead-letter queue holding jobs that failed three times"
  value       = aws_sqs_queue.jobs_dlq.url
}

output "retention_schedule_name" {
  description = "EventBridge Scheduler schedule that runs the nightly retention sweep"
  value       = aws_scheduler_schedule.retention.name
}

# --- Data ----------------------------------------------------------------------------

output "uploads_bucket_name" {
  description = "S3 bucket for recordings, documents and Transcribe output"
  value       = aws_s3_bucket.uploads.bucket
}

output "database_mode" {
  description = "Where the database comes from (external or aurora_serverless_v2)"
  value       = var.database_mode
}

output "database_endpoint" {
  description = "Aurora cluster endpoint (host) - null in external mode"
  value       = local.create_aurora ? aws_rds_cluster.main[0].endpoint : null
}

output "ssm_parameter_names" {
  description = "SSM Parameter Store names used to configure the functions"
  value = {
    DATABASE_URL         = "${local.ssm_prefix}/DATABASE_URL"
    JWT_SECRET           = aws_ssm_parameter.jwt_secret.name
    COOKIE_SECRET        = aws_ssm_parameter.cookie_secret.name
    ORIGIN_VERIFY_SECRET = aws_ssm_parameter.origin_verify_secret.name
    OPENROUTER_API_KEY   = aws_ssm_parameter.openrouter_api_key.name
  }
}

# --- CI/CD ---------------------------------------------------------------------------

output "github_deploy_role_arn" {
  description = "Store as the GitHub secret AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}

output "github_variables" {
  description = "Values for the GitHub repository variables used by the serverless deploy workflow"
  value = {
    AWS_REGION                 = var.aws_region
    WEB_BUCKET                 = aws_s3_bucket.web.bucket
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.web.id
    LAMBDA_API_NAME            = aws_lambda_function.api.function_name
    LAMBDA_WORKER_NAME         = aws_lambda_function.worker.function_name
    LAMBDA_SCHEDULED_NAME      = aws_lambda_function.scheduled.function_name
  }
}

# --- Manual DNS (when route53_zone_id is empty) -------------------------------------

output "dns_records_to_create" {
  description = "Records to create at your DNS provider when Route 53 is not used"
  value = {
    web = "${var.domain_name}  CNAME/ALIAS  ${aws_cloudfront_distribution.web.domain_name}"
  }
}

output "acm_certificate_arn" {
  description = "ACM certificate (us-east-1) used by CloudFront - the one you supplied or the one requested here"
  value       = local.create_certificate ? aws_acm_certificate.cloudfront[0].arn : var.acm_certificate_arn_us_east_1
}

output "acm_validation_record" {
  description = "DNS record that proves domain ownership for the requested certificate (null when you supplied acm_certificate_arn_us_east_1). Created automatically when route53_zone_id is set"
  value = local.create_certificate ? {
    name  = one(aws_acm_certificate.cloudfront[0].domain_validation_options).resource_record_name
    type  = one(aws_acm_certificate.cloudfront[0].domain_validation_options).resource_record_type
    value = one(aws_acm_certificate.cloudfront[0].domain_validation_options).resource_record_value
  } : null
}

output "ses_dns_records" {
  description = "SES verification and DKIM records for the email domain (null when create_ses_domain_identity = false)"
  value = var.create_ses_domain_identity ? {
    verification = "_amazonses.${local.email_domain}  TXT  ${aws_ses_domain_identity.main[0].verification_token}"
    dkim         = [for t in aws_ses_domain_dkim.main[0].dkim_tokens : "${t}._domainkey.${local.email_domain}  CNAME  ${t}.dkim.amazonses.com"]
  } : null
}
