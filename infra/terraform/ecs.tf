# ---------------------------------------------------------------------------
# ECS on Fargate: cluster, IAM roles, task definition and service for the API.
#
# Deployment model
#   - Terraform owns the "template" task definition (image tag var.api_image_tag,
#     environment, secrets, roles). It registers a new revision whenever these
#     change, but does NOT roll it out (lifecycle ignore_changes on the service).
#   - GitHub Actions (.github/workflows/deploy-api.yml) fetches the latest
#     revision of the family, swaps in the freshly built :<git-sha> image,
#     registers it and updates the service.
#   => After changing anything in this file, run the "Deploy API" workflow to
#      roll the change out.
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = local.name }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name}-api" }
}

# --- IAM: trust policy shared by both roles -----------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# --- IAM: task EXECUTION role (used by ECS itself to start the container) -------
# Pull from ECR, write logs, read the secrets injected as environment variables.

resource "aws_iam_role" "task_execution" {
  name               = "${local.name}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

locals {
  # Environment variable name -> Secrets Manager secret ARN
  api_secret_arns = {
    DATABASE_URL        = aws_secretsmanager_secret.database_url.arn
    JWT_SECRET          = aws_secretsmanager_secret.jwt_secret.arn
    COOKIE_SECRET       = aws_secretsmanager_secret.cookie_secret.arn
    OPENROUTER_API_KEY  = aws_secretsmanager_secret.openrouter_api_key.arn
    SEED_ADMIN_PASSWORD = aws_secretsmanager_secret.seed_admin_password.arn
  }
}

data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    sid       = "ReadAppSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(local.api_secret_arns)
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "read-app-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

# --- IAM: TASK role (what the running API is allowed to do) -----------------------

resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task" {
  # Recordings/documents and Transcribe output in the uploads bucket
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

  # Amazon Transcribe reads the media and writes the result using these same permissions
  statement {
    sid = "Transcribe"
    actions = [
      "transcribe:StartTranscriptionJob",
      "transcribe:GetTranscriptionJob",
      "transcribe:DeleteTranscriptionJob",
    ]
    resources = ["*"] # Transcribe job ARNs are not known in advance
  }

  # Notification emails from the verified SES domain only
  statement {
    sid       = "SendEmail"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [aws_ses_domain_identity.main.arn]
  }

  # Lets administrators open a shell in a running task with `aws ecs execute-command`
  statement {
    sid = "EcsExec"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "app-permissions"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

# --- Task definition ----------------------------------------------------------------

locals {
  # Non-secret configuration (see apps/api/.env.example for the contract)
  api_environment = {
    NODE_ENV  = "production"
    PORT      = "4000"
    LOG_LEVEL = var.log_level

    # Same origin for browser and API (CloudFront routes /api/* to the ALB)
    WEB_ORIGIN     = local.web_origin
    API_PUBLIC_URL = local.api_public_url

    STORAGE_PROVIDER    = "s3"
    S3_BUCKET           = aws_s3_bucket.uploads.bucket
    S3_REGION           = var.aws_region
    S3_FORCE_PATH_STYLE = "false"

    TRANSCRIPTION_PROVIDER = "aws"
    TRANSCRIBE_REGION      = var.aws_region
    TRANSCRIBE_LANGUAGE    = var.transcribe_language

    LLM_PROVIDER     = "openrouter"
    OPENROUTER_MODEL = var.openrouter_model

    EMAIL_PROVIDER = "ses"
    SES_REGION     = var.aws_region
    EMAIL_FROM     = var.email_from

    SEED_ADMIN_EMAIL = var.seed_admin_email
    SEED_DEMO_DATA   = var.seed_demo_data ? "true" : "false"

    RUN_WORKER_IN_API       = "true"
    RUN_MIGRATIONS_ON_START = "true"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.api_cpu)
  memory                   = tostring(var.api_memory)
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
      essential = true

      portMappings = [
        { containerPort = 4000, hostPort = 4000, protocol = "tcp" },
      ]

      environment = [for k, v in local.api_environment : { name = k, value = v }]
      secrets     = [for k, arn in local.api_secret_arns : { name = k, valueFrom = arn }]

      # Node has fetch built in; 127.0.0.1 avoids localhost resolving to ::1.
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 90 # migrations run on start
      }

      linuxParameters = {
        initProcessEnabled = true # tidy signal handling, needed for ECS Exec
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    },
  ])

  tags = { Name = "${local.name}-api" }
}

# --- Service -----------------------------------------------------------------------

resource "aws_ecs_service" "api" {
  name             = "${local.name}-api"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.api.arn
  desired_count    = var.api_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  enable_execute_command            = true
  health_check_grace_period_seconds = 120

  # Keep the old task running until the new one is healthy; roll back automatically if it never is.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  propagate_tags = "SERVICE"

  # GitHub Actions registers and deploys new revisions; Terraform must not undo them.
  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.https]

  tags = { Name = "${local.name}-api" }
}
