# ---------------------------------------------------------------------------
# Terraform and provider versions
# ---------------------------------------------------------------------------
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # -------------------------------------------------------------------------
  # Remote state (strongly recommended once more than one person runs Terraform).
  #
  # 1. Create an S3 bucket for state (versioning on, public access blocked) and a
  #    DynamoDB table with a partition key named "LockID" (string) in eu-west-2.
  # 2. Uncomment the block below and fill in the names.
  # 3. Run `terraform init -migrate-state` to move the local state file there.
  # -------------------------------------------------------------------------
  # backend "s3" {
  #   bucket         = "meeting-review-terraform-state-<aws-account-id>"
  #   key            = "prod/terraform.tfstate"
  #   region         = "eu-west-2"
  #   dynamodb_table = "meeting-review-terraform-locks"
  #   encrypt        = true
  # }
}

# All resources live in the London region (UK data residency). CloudFront is a
# global service; its certificate is created separately in us-east-1 (see README).
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}
