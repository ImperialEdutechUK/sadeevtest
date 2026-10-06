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

output "api_direct_url" {
  description = "Direct API URL bypassing CloudFront (null unless api_domain_name is set)"
  value       = local.api_direct_url
}

# --- Web / CDN -----------------------------------------------------------------

output "web_bucket_name" {
  description = "S3 bucket holding the built SPA"
  value       = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidations)"
  value       = aws_cloudfront_distribution.web.id
}

output "cloudfront_domain_name" {
  description = "CloudFront hostname - point domain_name here if DNS is managed outside Route 53"
  value       = aws_cloudfront_distribution.web.domain_name
}

# --- API ---------------------------------------------------------------------------

output "alb_dns_name" {
  description = "ALB hostname (direct access is rejected unless the request comes via CloudFront or api_domain_name)"
  value       = aws_lb.api.dns_name
}

output "ecr_repository_url" {
  description = "ECR repository for the API image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.api.name
}

output "ecs_task_family" {
  description = "ECS task definition family"
  value       = aws_ecs_task_definition.api.family
}

output "api_log_group" {
  description = "CloudWatch log group with the API logs"
  value       = aws_cloudwatch_log_group.api.name
}

# --- Data ----------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS endpoint (host:port) - reachable from inside the VPC only"
  value       = aws_db_instance.main.endpoint
}

output "uploads_bucket_name" {
  description = "S3 bucket for recordings, documents and Transcribe output"
  value       = aws_s3_bucket.uploads.bucket
}

output "secret_arns" {
  description = "Secrets Manager ARNs used by the API"
  value = {
    database_url        = aws_secretsmanager_secret.database_url.arn
    db_master           = aws_secretsmanager_secret.db_master.arn
    jwt_secret          = aws_secretsmanager_secret.jwt_secret.arn
    cookie_secret       = aws_secretsmanager_secret.cookie_secret.arn
    openrouter_api_key  = aws_secretsmanager_secret.openrouter_api_key.arn
    seed_admin_password = aws_secretsmanager_secret.seed_admin_password.arn
  }
}

# --- CI/CD ---------------------------------------------------------------------------

output "github_deploy_role_arn" {
  description = "Store as the GitHub secret AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}

output "github_variables" {
  description = "Values for the GitHub repository variables used by the deploy workflows"
  value = {
    AWS_REGION                 = var.aws_region
    WEB_BUCKET_NAME            = aws_s3_bucket.web.bucket
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.web.id
    ECR_REPOSITORY             = aws_ecr_repository.api.name
    ECS_CLUSTER                = aws_ecs_cluster.main.name
    ECS_SERVICE                = aws_ecs_service.api.name
    ECS_TASK_FAMILY            = aws_ecs_task_definition.api.family
    VITE_API_BASE_URL          = "/api"
  }
}

# --- One-off tasks -------------------------------------------------------------------

output "seed_task_command" {
  description = "Run once after the first API deployment to create the first administrator"
  value       = <<-EOT
    aws ecs run-task \
      --region ${var.aws_region} \
      --cluster ${aws_ecs_cluster.main.name} \
      --launch-type FARGATE \
      --task-definition ${aws_ecs_task_definition.api.family} \
      --network-configuration "awsvpcConfiguration={subnets=[${join(",", aws_subnet.private[*].id)}],securityGroups=[${aws_security_group.ecs_tasks.id}],assignPublicIp=DISABLED}" \
      --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/seed/seed.js"]}]}'
  EOT
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS tasks, RDS)"
  value       = aws_subnet.private[*].id
}

output "ecs_tasks_security_group_id" {
  description = "Security group of the API tasks"
  value       = aws_security_group.ecs_tasks.id
}

# --- Manual DNS (when route53_zone_id is empty) -------------------------------------

output "dns_records_to_create" {
  description = "Records to create at your DNS provider when Route 53 is not used"
  value = {
    web = "${var.domain_name}  CNAME/ALIAS  ${aws_cloudfront_distribution.web.domain_name}"
    api = local.create_direct_api ? "${var.api_domain_name}  CNAME/ALIAS  ${aws_lb.api.dns_name}" : "not needed (api_domain_name is empty)"
  }
}

output "ses_dns_records" {
  description = "SES verification and DKIM records for the email domain"
  value = {
    verification = "_amazonses.${local.email_domain}  TXT  ${aws_ses_domain_identity.main.verification_token}"
    dkim         = [for t in aws_ses_domain_dkim.main.dkim_tokens : "${t}._domainkey.${local.email_domain}  CNAME  ${t}.dkim.amazonses.com"]
  }
}
