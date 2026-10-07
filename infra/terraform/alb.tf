# ---------------------------------------------------------------------------
# Application Load Balancer in the public subnets, terminating TLS with the
# regional certificate and forwarding to the API tasks on port 4000.
#
# Who may reach the API through the ALB (HTTPS listener):
#   1. CloudFront - requests carrying the secret X-Origin-Verify header
#   2. Direct clients on api_domain_name - only if that variable is set
#   3. Everyone else - 403 (unless enforce_cloudfront_origin = false)
# ---------------------------------------------------------------------------
resource "aws_lb" "api" {
  name               = "${local.name}-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  drop_invalid_header_fields = true
  idle_timeout               = 60
  enable_deletion_protection = false

  tags = { Name = "${local.name}-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api"
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip" # Fargate tasks register by private IP
  vpc_id      = aws_vpc.main.id

  deregistration_delay = 30

  health_check {
    enabled             = true
    protocol            = "HTTP"
    path                = "/api/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = "${local.name}-api" }
}

# Plain HTTP is only there to redirect to HTTPS.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn_regional

  # Default action when enforce_cloudfront_origin = true: reject.
  dynamic "default_action" {
    for_each = var.enforce_cloudfront_origin ? [1] : []

    content {
      type = "fixed-response"

      fixed_response {
        content_type = "text/plain"
        message_body = "Forbidden"
        status_code  = "403"
      }
    }
  }

  # Default action when enforce_cloudfront_origin = false: forward everything.
  dynamic "default_action" {
    for_each = var.enforce_cloudfront_origin ? [] : [1]

    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.api.arn
    }
  }
}

# Rule 1: requests that came through CloudFront carry the shared secret.
resource "aws_lb_listener_rule" "from_cloudfront" {
  count = var.enforce_cloudfront_origin ? 1 : 0

  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }
}

# Rule 2: optional direct access on api_domain_name (bypasses CloudFront).
resource "aws_lb_listener_rule" "direct_api" {
  count = local.create_direct_api ? 1 : 0

  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = [var.api_domain_name]
    }
  }
}
