# ---------------------------------------------------------------------------
# Optional database: Aurora PostgreSQL Serverless v2 that scales to ZERO.
# Everything in this file exists only when database_mode = "aurora_serverless_v2".
#
# Design - and the trade-off, stated plainly
#   The Lambda functions run OUTSIDE any VPC. Putting them inside one would
#   require a NAT gateway (about USD 32/month plus per-GB fees in London) or
#   VPC interface endpoints (about USD 7/month each) for them to reach S3,
#   Transcribe, SES, SQS and OpenRouter. Instead the cluster gets a PUBLIC
#   endpoint in a tiny dedicated VPC with public subnets only, protected by:
#     - TLS enforced server-side (cluster parameter rds.force_ssl = 1),
#     - a 32-character random master password that lives only in SSM/Terraform state,
#     - a security group that can be narrowed with aurora_allowed_cidrs,
#     - encrypted storage, 7-day backups and deletion protection.
#   Lambda egress addresses are not predictable, so the default allows 5432 from
#   anywhere; the endpoint is therefore discoverable, but not usable without the
#   password. If that is unacceptable for your DPIA, use database_mode =
#   "external" with a provider that offers private networking, or the container
#   stack in ../terraform.
#
# Cost: USD 0 compute while paused (0 ACU); about USD 0.14 per ACU-hour while
# active (minimum 0.5 ACU => roughly USD 0.07/hour of use), storage about
# USD 0.11/GB-month, I/O USD 0.22 per million requests. The first request after a
# pause waits roughly 15 seconds for the resume.
# ---------------------------------------------------------------------------

locals {
  aurora_major = split(".", var.aurora_engine_version)[0]
}

# --- Network: VPC with two public subnets, nothing else ------------------------------

resource "aws_vpc" "db" {
  count = local.create_aurora ? 1 : 0

  cidr_block           = var.aurora_vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name}-db" }
}

resource "aws_internet_gateway" "db" {
  count = local.create_aurora ? 1 : 0

  vpc_id = aws_vpc.db[0].id

  tags = { Name = "${local.name}-db" }
}

resource "aws_subnet" "db_public" {
  count = local.create_aurora ? 2 : 0

  vpc_id                  = aws_vpc.db[0].id
  cidr_block              = cidrsubnet(var.aurora_vpc_cidr, 2, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = { Name = "${local.name}-db-public-${count.index + 1}" }
}

resource "aws_route_table" "db_public" {
  count = local.create_aurora ? 1 : 0

  vpc_id = aws_vpc.db[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.db[0].id
  }

  tags = { Name = "${local.name}-db-public" }
}

resource "aws_route_table_association" "db_public" {
  count = local.create_aurora ? 2 : 0

  subnet_id      = aws_subnet.db_public[count.index].id
  route_table_id = aws_route_table.db_public[0].id
}

resource "aws_security_group" "aurora" {
  count = local.create_aurora ? 1 : 0

  name        = "${local.name}-aurora"
  description = "PostgreSQL access to the ${local.name} Aurora cluster (TLS enforced by the cluster)"
  vpc_id      = aws_vpc.db[0].id

  tags = { Name = "${local.name}-aurora" }
}

resource "aws_vpc_security_group_ingress_rule" "aurora_postgres" {
  for_each = local.create_aurora ? toset(var.aurora_allowed_cidrs) : toset([])

  security_group_id = aws_security_group.aurora[0].id
  description       = "PostgreSQL over TLS"
  cidr_ipv4         = each.value
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"

  tags = { Name = "${local.name}-aurora-postgres" }
}

resource "aws_db_subnet_group" "aurora" {
  count = local.create_aurora ? 1 : 0

  name        = "${local.name}-aurora"
  description = "Public subnets for the ${local.name} Aurora cluster"
  subnet_ids  = aws_subnet.db_public[*].id

  tags = { Name = "${local.name}-aurora" }
}

# --- Cluster ---------------------------------------------------------------------------

# TLS is mandatory: plain-text connections are refused by the server.
resource "aws_rds_cluster_parameter_group" "aurora" {
  count = local.create_aurora ? 1 : 0

  name        = "${local.name}-aurora-postgresql${local.aurora_major}"
  family      = "aurora-postgresql${local.aurora_major}"
  description = "${local.name}: enforce TLS"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = { Name = "${local.name}-aurora" }
}

# Alphanumeric only so the password can be embedded in a URL without encoding.
resource "random_password" "aurora_master" {
  count = local.create_aurora ? 1 : 0

  length  = 32
  special = false
}

resource "aws_rds_cluster" "main" {
  count = local.create_aurora ? 1 : 0

  cluster_identifier = "${local.name}-db"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # Serverless v2 runs in provisioned mode with the scaling block below
  engine_version     = var.aurora_engine_version

  database_name   = var.aurora_db_name
  master_username = var.aurora_master_username
  master_password = random_password.aurora_master[0].result
  port            = 5432

  db_subnet_group_name            = aws_db_subnet_group.aurora[0].name
  vpc_security_group_ids          = [aws_security_group.aurora[0].id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora[0].name
  network_type                    = "IPV4"

  serverlessv2_scaling_configuration {
    min_capacity             = var.aurora_min_capacity
    max_capacity             = var.aurora_max_capacity
    seconds_until_auto_pause = var.aurora_min_capacity == 0 ? var.aurora_seconds_until_auto_pause : null
  }

  storage_encrypted = true

  backup_retention_period      = 7
  preferred_backup_window      = "01:00-02:00" # UTC, before the 02:30 retention sweep
  preferred_maintenance_window = "sun:02:30-sun:03:30"
  copy_tags_to_snapshot        = true

  deletion_protection       = var.aurora_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-db-final"

  # Data API: run SQL from the console/CLI without a client or bastion (billed per request, nothing when unused).
  enable_http_endpoint = var.aurora_enable_data_api

  apply_immediately = true

  tags = { Name = "${local.name}-db" }
}

resource "aws_rds_cluster_instance" "main" {
  count = local.create_aurora ? 1 : 0

  identifier         = "${local.name}-db-1"
  cluster_identifier = aws_rds_cluster.main[0].id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main[0].engine
  engine_version     = aws_rds_cluster.main[0].engine_version

  db_subnet_group_name = aws_db_subnet_group.aurora[0].name
  publicly_accessible  = true

  auto_minor_version_upgrade   = true
  ca_cert_identifier           = "rds-ca-rsa2048-g1"
  performance_insights_enabled = false
  monitoring_interval          = 0
  apply_immediately            = true

  tags = { Name = "${local.name}-db-1" }
}

# --- DATABASE_URL in SSM (same path the external mode expects) -----------------------------

resource "aws_ssm_parameter" "database_url" {
  count = local.create_aurora ? 1 : 0

  name        = "${local.ssm_prefix}/DATABASE_URL"
  description = "PostgreSQL connection string for the ${local.name} API (Aurora Serverless v2)"
  type        = "SecureString"
  tier        = "Standard"
  value       = "postgresql://${var.aurora_master_username}:${random_password.aurora_master[0].result}@${aws_rds_cluster.main[0].endpoint}:${aws_rds_cluster.main[0].port}/${var.aurora_db_name}?${var.aurora_db_connection_options}"

  tags = { Name = "${local.name}-database-url" }
}
