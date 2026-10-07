# ---------------------------------------------------------------------------
# Input variables - copy terraform.tfvars.example to terraform.tfvars and edit.
# ---------------------------------------------------------------------------

# --- Naming and region ------------------------------------------------------

variable "project_name" {
  description = "Short name used as a prefix for every resource and for the SSM parameter path (lower-case, hyphens)."
  type        = string
  default     = "meeting-review"
}

variable "environment" {
  description = "Deployment environment name, e.g. prod or staging. Use a different value from the container stack (infra/terraform) if both run in the same AWS account - resource names and SSM paths include it."
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

# --- Domain, certificate and DNS ------------------------------------------------

variable "domain_name" {
  description = "Public hostname of the web app, e.g. meetingreview.example.ac.uk. The SPA and the API (/api/*) are both served from this hostname via CloudFront. Required: the API needs it at deploy time (WEB_ORIGIN, cookies, S3 CORS)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.domain_name))
    error_message = "domain_name must be a lower-case DNS hostname such as meetingreview.example.ac.uk."
  }
}

variable "acm_certificate_arn_us_east_1" {
  description = "ARN of an ISSUED ACM certificate in us-east-1 covering domain_name. Leave empty and Terraform requests one (DNS validation; automatic when route53_zone_id is set, see README otherwise). ACM certificates are free."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "ID of an EXISTING Route 53 hosted zone authoritative for domain_name (and the email domain). Leave empty to manage DNS elsewhere - the records to create are printed as outputs. No hosted zone is ever created here (they cost USD 0.50/month)."
  type        = string
  default     = ""
}

# --- GitHub Actions deploy role --------------------------------------------------

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
  description = "Create the GitHub OIDC identity provider in this account. Set to false if the account already has one (there can only be one per account, e.g. created by infra/terraform) - it is then looked up instead."
  type        = bool
  default     = true
}

# --- Lambda ------------------------------------------------------------------------

variable "lambda_zip_path" {
  description = "Path to the zipped Lambda bundle (contents of apps/api/lambda-dist: api.mjs, worker.mjs, scheduled.mjs, package.json). Relative paths resolve from the directory terraform runs in. If the file does not exist a placeholder bundle is uploaded and the real code is shipped by the deploy workflow."
  type        = string
  default     = "../../apps/api/lambda-dist.zip"
}

variable "lambda_architecture" {
  description = "CPU architecture for the three functions. arm64 (Graviton) is about 20% cheaper per GB-second; the bundle is plain JavaScript so either works."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.lambda_architecture)
    error_message = "lambda_architecture must be arm64 or x86_64."
  }
}

variable "api_memory_mb" {
  description = "Memory for the HTTP API function (CPU scales with it)."
  type        = number
  default     = 1024
}

variable "api_timeout_seconds" {
  description = "Timeout for the HTTP API function. CloudFront waits at most 60 s for an origin, so values above 60 only help background work."
  type        = number
  default     = 60
}

variable "api_reserved_concurrency" {
  description = "Reserved concurrency for the API function (-1 = none, use the account pool). Setting a small number caps database connections; it requires the account to keep 100 unreserved executions, which brand-new accounts with a 10-execution quota cannot do."
  type        = number
  default     = -1
}

variable "worker_memory_mb" {
  description = "Memory for the background worker function (transcription polling, document parsing, LLM analysis)."
  type        = number
  default     = 2048
}

variable "worker_timeout_seconds" {
  description = "Timeout for the worker function (max 900). The job queue's visibility timeout is 6x this value."
  type        = number
  default     = 900

  validation {
    condition     = var.worker_timeout_seconds >= 1 && var.worker_timeout_seconds <= 900
    error_message = "worker_timeout_seconds must be between 1 and 900."
  }
}

variable "worker_max_concurrency" {
  description = "Maximum number of worker invocations running at once (Lambda SQS maximum concurrency, minimum 2). Also bounds concurrent Transcribe jobs and database connections."
  type        = number
  default     = 5

  validation {
    condition     = var.worker_max_concurrency >= 2 && var.worker_max_concurrency <= 1000
    error_message = "worker_max_concurrency must be between 2 and 1000."
  }
}

variable "scheduled_memory_mb" {
  description = "Memory for the nightly retention function."
  type        = number
  default     = 1024
}

variable "scheduled_timeout_seconds" {
  description = "Timeout for the nightly retention function."
  type        = number
  default     = 300
}

variable "retention_schedule_expression" {
  description = "EventBridge Scheduler expression for the nightly retention sweep (UTC)."
  type        = string
  default     = "cron(30 2 * * ? *)"
}

variable "log_level" {
  description = "API log level (pino): trace, debug, info, warn, error."
  type        = string
  default     = "info"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the three function log groups."
  type        = number
  default     = 14
}

# --- Database ------------------------------------------------------------------------

variable "database_mode" {
  description = <<-EOT
    Where the PostgreSQL database comes from:
      external            - (default) the team creates the SSM SecureString parameter
                            /<project_name>/<environment>/DATABASE_URL pointing at any
                            Postgres reachable over TLS (e.g. a managed Postgres with a
                            free tier in London). Terraform only reads it.
      aurora_serverless_v2 - Terraform creates an Aurora PostgreSQL Serverless v2 cluster
                            that scales to 0 ACU when idle, with a public endpoint
                            (TLS enforced) so the Lambdas stay outside any VPC and no
                            NAT gateway is needed. Read the trade-off in the README.
  EOT
  type        = string
  default     = "external"

  validation {
    condition     = contains(["external", "aurora_serverless_v2"], var.database_mode)
    error_message = "database_mode must be external or aurora_serverless_v2."
  }
}

variable "aurora_engine_version" {
  description = "Aurora PostgreSQL engine version (aurora mode only). Scale-to-zero (min 0 ACU) needs 13.15+, 14.12+, 15.7+, 16.3+ or any 17.x. Check availability with: aws rds describe-db-engine-versions --engine aurora-postgresql --query 'DBEngineVersions[].EngineVersion' --region eu-west-2"
  type        = string
  default     = "16.8"
}

variable "aurora_min_capacity" {
  description = "Minimum ACUs (aurora mode). 0 lets the cluster pause completely when idle; 0.5 keeps it always on (0.5 ACU x USD 0.14 per ACU-hour = about USD 0.07/hour, roughly USD 51/month in London, i.e. no longer 'cents')."
  type        = number
  default     = 0
}

variable "aurora_max_capacity" {
  description = "Maximum ACUs (aurora mode). 1 ACU is plenty for a small college deployment."
  type        = number
  default     = 1
}

variable "aurora_seconds_until_auto_pause" {
  description = "Idle seconds before the cluster pauses (aurora mode, only used when aurora_min_capacity = 0). 300-86400. Resuming takes roughly 15 seconds, which the first request after a pause waits for."
  type        = number
  default     = 300

  validation {
    condition     = var.aurora_seconds_until_auto_pause >= 300 && var.aurora_seconds_until_auto_pause <= 86400
    error_message = "aurora_seconds_until_auto_pause must be between 300 and 86400."
  }
}

variable "aurora_db_name" {
  description = "Name of the application database (aurora mode)."
  type        = string
  default     = "meeting_review"
}

variable "aurora_master_username" {
  description = "Master username (aurora mode)."
  type        = string
  default     = "meeting_review"
}

variable "aurora_allowed_cidrs" {
  description = "IPv4 CIDR blocks allowed to reach port 5432 (aurora mode). Lambda functions outside a VPC come from AWS's public address space, so 0.0.0.0/0 is required unless you also route them through a VPC + NAT gateway (which is what this profile avoids). TLS and a 32-character random password protect the endpoint."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "aurora_db_connection_options" {
  description = "Query string appended to the generated DATABASE_URL (aurora mode). The bundled pg driver treats sslmode=require as verify-full and the RDS CA is not in Node's trust store, so no-verify (encrypted, certificate not checked) is the working default. See README for the verify-full recipe."
  type        = string
  default     = "sslmode=no-verify"
}

variable "aurora_vpc_cidr" {
  description = "CIDR of the small dedicated VPC that holds only the Aurora cluster (aurora mode). Two public subnets are carved out of it."
  type        = string
  default     = "10.30.0.0/24"
}

variable "aurora_deletion_protection" {
  description = "Protect the Aurora cluster from deletion (aurora mode). Set to false (and apply) before terraform destroy."
  type        = bool
  default     = true
}

variable "aurora_enable_data_api" {
  description = "Enable the RDS Data API on the cluster (aurora mode) so SQL can be run from the console query editor or CLI without a client or bastion. Billed per request only; set to false if the API is not offered for Serverless v2 in your region."
  type        = bool
  default     = true
}

# --- Application settings ---------------------------------------------------------------

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
  description = "From address for notification emails, e.g. \"Meeting Review <no-reply@example.ac.uk>\". The domain part is the SES sending identity."
  type        = string

  validation {
    condition     = can(regex("@[A-Za-z0-9.-]+", var.email_from))
    error_message = "email_from must contain an email address (something@domain)."
  }
}

variable "create_ses_domain_identity" {
  description = "Register the email_from domain as an SES identity (with DKIM) in this stack. Set to false if the same account/region already verifies that domain (for example through infra/terraform) - the existing identity is then referenced by ARN."
  type        = bool
  default     = true
}

variable "recording_retention_days" {
  description = "Days to keep uploaded recordings (objects under recordings/) before S3 deletes them. 0 keeps them forever."
  type        = number
  default     = 90
}
