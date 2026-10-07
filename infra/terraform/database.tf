# ---------------------------------------------------------------------------
# RDS PostgreSQL 16 in the private subnets. The master password is generated
# here and only ever stored in Secrets Manager; the API reads the complete
# DATABASE_URL from its own secret.
# ---------------------------------------------------------------------------

# Alphanumeric only so the password can be embedded in a URL without encoding.
resource "random_password" "db_master" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name        = "${local.name}-db"
  description = "Private subnets for ${local.name}"
  subnet_ids  = aws_subnet.private[*].id

  tags = { Name = "${local.name}-db" }
}

resource "aws_db_instance" "main" {
  identifier = "${local.name}-db"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_master.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period   = 7
  backup_window             = "01:00-02:00" # UTC, outside UK working hours
  maintenance_window        = "sun:02:30-sun:03:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-db-final"

  auto_minor_version_upgrade = true
  apply_immediately          = false
  ca_cert_identifier         = "rds-ca-rsa2048-g1"

  tags = { Name = "${local.name}-db" }
}

# --- Secrets ---------------------------------------------------------------

# Master credentials in the standard RDS JSON shape (handy for psql / DBeaver access via a bastion).
resource "aws_secretsmanager_secret" "db_master" {
  name                    = "${local.name}/db-master"
  description             = "RDS master credentials for ${local.name}"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "db_master" {
  secret_id = aws_secretsmanager_secret.db_master.id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.db_name
    username = var.db_username
    password = random_password.db_master.result
  })
}

# The connection string injected into the API container as DATABASE_URL.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  description             = "DATABASE_URL for the ${local.name} API"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.db_username}:${random_password.db_master.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}?${var.db_connection_options}"
}
