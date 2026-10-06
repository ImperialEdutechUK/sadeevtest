# ---------------------------------------------------------------------------
# Terraform and provider versions - serverless (pay-per-request) profile.
#
# This root module is the low-cost sibling of ../terraform. It deliberately uses
# only services with no hourly charge: S3, CloudFront, Lambda (function URLs),
# SQS, EventBridge Scheduler, SSM Parameter Store standard parameters, ACM and
# CloudWatch Logs. No VPC-bound compute, no NAT gateway, no load balancer.
# ---------------------------------------------------------------------------
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.90"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # Only used to build a tiny placeholder bundle when apps/api/lambda-dist.zip
    # has not been built yet (see lambda.tf). Nothing is created in AWS by it.
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # -------------------------------------------------------------------------
  # Remote state (strongly recommended once more than one person runs Terraform).
  # The state contains the generated secrets, so keep the bucket private.
  #
  # 1. Create an S3 bucket for state (versioning on, public access blocked) in
  #    eu-west-2. Terraform >= 1.10 can lock with S3 conditional writes
  #    (use_lockfile = true) so no DynamoDB table is needed; on older Terraform
  #    create a DynamoDB table with a partition key "LockID" (string) instead
  #    and set dynamodb_table (pay-per-request tables cost nothing when idle).
  # 2. Uncomment the block below and fill in the names.
  # 3. Run `terraform init -migrate-state` to move the local state file there.
  # -------------------------------------------------------------------------
  # backend "s3" {
  #   bucket       = "meeting-review-terraform-state-<aws-account-id>"
  #   key          = "serverless/prod/terraform.tfstate"
  #   region       = "eu-west-2"
  #   encrypt      = true
  #   use_lockfile = true
  #   # dynamodb_table = "meeting-review-terraform-locks"   # Terraform < 1.10
  # }
}

# All regional resources live in London (UK data residency). CloudFront is a
# global service and only accepts certificates from us-east-1, hence the alias.
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}
