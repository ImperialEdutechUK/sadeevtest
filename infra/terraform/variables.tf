# ---------------------------------------------------------------------------
# Input variables - copy terraform.tfvars.example to terraform.tfvars and edit.
# ---------------------------------------------------------------------------

# --- Naming and region ------------------------------------------------------

variable "project_name" {
  description = "Short name used as a prefix for every resource (lower-case, hyphens)."
  type        = string
  default     = "meeting-review"
}

variable "environment" {
  description = "Deployment environment name, e.g. prod or staging."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for all regional resources. eu-west-2 (London) keeps data in the UK."
  type        = string
  default     = "eu-west-2"
}

variable "tags" {
  description = "Extra tags applied to every resource (merged with Project/Environment/ManagedBy)."
  type        = map(string)
  default     = {}
}

# --- Domains and certificates ----------------------------------------------

variable "domain_name" {
  description = "Public hostname of the web app, e.g. meetingreview.example.ac.uk. The SPA and the API (/api/*) are both served from this hostname via CloudFront."
  type        = string
}

variable "api_domain_name" {
  description = "Optional extra hostname for direct API access that bypasses CloudFront, e.g. api.meetingreview.example.ac.uk. Leave empty (recommended) so the ALB is only reachable through CloudFront."
  type        = string
  default     = ""
}

variable "acm_certificate_arn_us_east_1" {
  description = "ARN of an ACM certificate in us-east-1 covering domain_name. CloudFront can only use certificates from us-east-1."
  type        = string
}

variable "acm_certificate_arn_regional" {
  description = "ARN of an ACM certificate in var.aws_region for the ALB. It MUST cover domain_name (CloudFront forwards the viewer Host header to the ALB) and, if set, api_domain_name."
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID that is authoritative for domain_name (and the email domain). Leave empty to skip DNS record creation and manage DNS elsewhere."
  type        = string
  default     = ""
}

variable "enforce_cloudfront_origin" {
  description = "When true the ALB only forwards requests that carry the secret X-Origin-Verify header added by CloudFront (plus direct requests for api_domain_name, if set). Everything else gets a 403."
  type        = bool
  default     = true
}

# --- GitHub Actions deploy role --------------------------------------------

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, in the form owner/repo."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/repo."
  }
}

variable "github_deploy_branch" {
  description = "Branch whose workflow runs may assume the deploy role."
  type        = string
  default     = "main"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC identity provider in this account. Set to false if the account already has one (there can only be one per account) - it is then looked up instead."
  type        = bool
  default     = true
}

# --- Database ----------------------------------------------------------------

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Initial RDS storage in GiB."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Upper limit for RDS storage autoscaling in GiB (0 disables autoscaling)."
  type        = number
  default     = 100
}

variable "db_engine_version" {
  description = "PostgreSQL major (or major.minor) version."
  type        = string
  default     = "16"
}

variable "db_name" {
  description = "Name of the application database."
  type        = string
  default     = "meeting_review"
}

variable "db_username" {
  description = "Master username for the database."
  type        = string
  default     = "meeting_review"
}

variable "db_multi_az" {
  description = "Run RDS in Multi-AZ (roughly doubles the database cost, improves availability)."
  type        = bool
  default     = false
}

variable "db_connection_options" {
  description = "Query string appended to DATABASE_URL. RDS enforces TLS by default; change to e.g. sslmode=no-verify if the Node pg driver rejects the RDS certificate (see README troubleshooting)."
  type        = string
  default     = "sslmode=require"
}

# --- API service ---------------------------------------------------------------

variable "api_cpu" {
  description = "Fargate CPU units for the API task (256, 512, 1024, 2048...)."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory (MiB) for the API task. Must be a valid pairing with api_cpu."
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Number of API tasks to run."
  type        = number
  default     = 1
}

variable "api_image_tag" {
  description = "Image tag used in the Terraform-managed task definition. Deployments from GitHub Actions register new revisions tagged with the git SHA."
  type        = string
  default     = "latest"
}

variable "log_level" {
  description = "API log level (pino): trace, debug, info, warn, error."
  type        = string
  default     = "info"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the API log group."
  type        = number
  default     = 30
}

# --- Application settings ------------------------------------------------------

variable "openrouter_model" {
  description = "OpenRouter model used for analysis."
  type        = string
  default     = "anthropic/claude-sonnet-5.5"
}

variable "transcribe_language" {
  description = "Amazon Transcribe language code."
  type        = string
  default     = "en-GB"
}

variable "email_from" {
  description = "From address for notification emails, e.g. \"Meeting Review <no-reply@example.ac.uk>\". The domain part is registered as an SES identity."
  type        = string

  validation {
    condition     = can(regex("@[A-Za-z0-9.-]+", var.email_from))
    error_message = "email_from must contain an email address (something@domain)."
  }
}

variable "seed_admin_email" {
  description = "Email address of the first system administrator created by the seed task."
  type        = string
}

variable "seed_demo_data" {
  description = "Whether the seed task should also create demo tutors, meetings and reports."
  type        = bool
  default     = false
}

variable "recording_retention_days" {
  description = "Days to keep uploaded recordings (objects under recordings/) before S3 deletes them. 0 keeps them forever."
  type        = number
  default     = 90
}
