# Hosting costs: the pay-per-request profile

This document explains what the pay-per-request deployment profile
(`infra/terraform-serverless`, described in
[deployment-aws.md, section 16](deployment-aws.md#16-pay-per-request-profile-cents-per-month))
costs to run, where every number comes from, and what would silently turn a
"cents per month" bill into a "pounds per month" bill.

**How to read the figures.** AWS invoices in US dollars (plus UK VAT) unless
the billing currency is changed, so every price below is in USD. Two kinds of
numbers appear:

- **Unit prices** are facts read on **6 October 2026** from the sources in
  [section 8](#8-sources-and-what-could-not-be-verified). Each one is marked
  *verified* (read from AWS's own machine-readable price list or OpenRouter's
  models API) or *unverified* (the page could not be opened from the research
  environment; the figure comes from a search-result snippet or is a widely
  published figure, and must be confirmed before anyone relies on it).
- **Monthly and per-meeting costs** are **estimates**: unit prices multiplied
  by the usage assumptions stated in [section 2.1](#21-usage-assumptions).
  They are not quotes. The first real bill, read in Cost Explorer, replaces them.

Prices change; re-check the sources before quoting any figure outside the team.

---

## 1. The principle: fixed cost in cents, variable cost per meeting

The container profile (`infra/terraform`) bills by the hour whether or not
anyone uses the system: a NAT gateway, an Application Load Balancer, a Fargate
task and an RDS instance together cost on the order of USD 100 a month before
the first meeting is processed ([section 4](#4-comparison-with-the-always-on-container-profile)).

The pay-per-request profile uses only services that bill **per request, per
GB-second or per GB stored**, most of them inside an *always-free* allowance
(CloudFront, Lambda, SQS, EventBridge Scheduler, SSM Parameter Store, the
CloudWatch basics). A month in which nobody signs in costs **fractions of a
cent** (the few megabytes of the web bucket). A busy month costs what it uses,
and what it uses is dominated by two **variable, per-meeting** items that exist
in both profiles:

- **Amazon Transcribe**, per second of audio, only when a recording is
  uploaded rather than a Teams transcript;
- **OpenRouter**, per token, for the review and the appraisal summary.

Everything else at the college's scale adds up to well under one dollar a
month ([section 2](#2-fixed-resources-of-the-serverless-profile)). The design
rules that make this true are listed in
[section 6](#6-what-breaks-the-cents-promise-and-how-the-terraform-avoids-it);
breaking any one of them re-introduces a fixed hourly charge.

---

## 2. Fixed resources of the serverless profile

### 2.1 Usage assumptions

All monthly estimates in this document use the same assumptions. Change them
and the estimates change proportionally.

| Assumption | Value | Why |
| --- | --- | --- |
| Staff using the system | 50 | College estimate |
| Meetings processed per month | 200 | College estimate |
| API requests | 3,000 per day, 90,000 per 30-day month | College estimate |
| Billing month | 730 hours | AWS convention for hourly services |
| Lambda `api` | 1,024 MB; average billed duration 150 ms warm; one invocation in fifty is a cold start adding 2 s; all functions on arm64 (the module's `lambda_architecture` default), which is billed 20% below x86 | Node 22 + Prisma; cold start measured at roughly 1-3 s in the deployment guide |
| Lambda `worker` per meeting | 2,048 MB; 19 invocations (1 start transcription at 3 s, 15 status checks at 2 s, 1 analysis at 120 s wall-clock waiting on OpenRouter, 2 notification jobs at 3 s) = 159 s, 318 GB-s | The worker re-queues a check every 30-60 s instead of waiting; LLM calls time out after 3 min |
| Lambda `scheduled` | 30 runs of 30 s at 1,024 MB = 900 GB-s | Nightly retention sweep |
| SPA loads | 50 staff x 22 working days x 1 full load of ~2.5 MB and ~20 files | Hashed assets are cached for a year, so most days load only `index.html` and the API |
| API payloads | 20 KB response, 2 KB request on average | JSON |
| Recording | 30 minutes, ~30 MB (about 1 MB per minute of compressed audio), kept 90 days, played back twice | `recording_retention_days` default |
| Emails | 50 invitations plus 4 notification emails per meeting = 850 per month | Invitations, report ready, appraisal shared, reminders |
| Logs | 1.5 KB per API request, 5 KB per worker invocation at `LOG_LEVEL=info` | pino JSON plus Lambda START/END/REPORT lines |

### 2.2 The table

"Always-free allowance" means the permanent free tier that applies to every
AWS account, including accounts created after the July 2025 free-tier change
(see the note under the table). Prices are for EU (London), `eu-west-2`,
except CloudFront and Route 53, which are global. Estimated costs are shown
twice: with the always-free allowance applied, and as if no free tier existed
at all (an upper bound, useful if the account's allowances are consumed by
other workloads).

| Resource | What is billed | London unit price (verified unless marked) | Always-free allowance | Estimated monthly use at the college's scale | Estimated monthly cost: with free tier / without |
| --- | --- | --- | --- | --- | --- |
| CloudFront distribution (SPA and `/api/*`) | Data out to viewers; HTTPS requests; CloudFront Function executions; data to origin | $0.085 per GB (first 10 TB, Europe); $0.012 per 10,000 HTTPS requests; $0.10 per 1M function executions; $0.020 per GB to origin | 1 TB out, 10M requests, 2M function executions per month | 4.4 GB out; 112,000 requests; 22,000 function executions; 0.17 GB to origin | **$0.00** / $0.51 |
| S3 web bucket | Storage; PUT on deploy | $0.024 per GB-month; $0.0053 per 1,000 PUT | None that applies to new accounts (see note) | 5 MB; ~120 PUT | **$0.00** (about $0.0007) / same |
| Lambda `api` | Requests; GB-seconds (arm64 default; x86 would be $0.0000166667 per GB-s) | $0.20 per 1M requests; $0.0000133334 per GB-s | 1M requests and 400,000 GB-s per month, shared by all functions | 90,000 requests; 17,100 GB-s | **$0.00** / $0.25 |
| Lambda `worker` | Requests; GB-seconds | as above | shared, as above | 3,800 requests; 63,600 GB-s | **$0.00** / $0.85 |
| Lambda `scheduled` | Requests; GB-seconds | as above | shared, as above | 30 requests; 900 GB-s | **$0.00** / $0.01 |
| Lambda function URL | Nothing beyond the Lambda request and duration charges (unverified: AWS announcement, page blocked) | n/a | n/a | n/a | **$0.00** |
| SQS job queue and dead-letter queue | API requests (send, receive, delete, including empty receives) | $0.40 per 1M standard requests (first 100 billion) | 1M requests per month | Lambda's pollers long-poll the queue continuously: up to 5 pollers x 3 calls/min = **648,000 empty receives per month** (estimate, see 2.3) plus 11,400 message requests = 659,400 | **$0.00** / $0.26 |
| EventBridge Scheduler (nightly `cron(30 2 * * ? *)`) | Scheduled invocations | $1.15 per 1M beyond the free tier (London) | 14M invocations per month | 30 | **$0.00** / $0.00003 |
| SSM Parameter Store (5 SecureString parameters, standard tier) | Nothing for standard parameters and standard throughput; advanced parameters $0.05 per parameter-month | No charge (the price list has no line item for standard parameters; the pricing page could not be opened to quote its wording) | n/a (never billed) | 5 standard parameters, read only at `terraform apply` | **$0.00** |
| KMS (AWS-managed key `aws/ssm` for SecureString; SSE-S3 for buckets) | API requests; customer-managed keys cost $1 per key-month, AWS-managed keys have no monthly fee | $0.03 per 10,000 requests | 20,000 requests per month | A handful of decrypts per `terraform apply` | **$0.00** |
| CloudWatch Logs (3 log groups, 14-day retention) | GB ingested; GB-month stored | $0.5985 per GB ingested (Standard class); $0.0315 per GB-month stored | 5 GB ingested per month | 0.15 GB ingested; ~0.07 GB stored on average | **$0.00** / $0.09 |
| S3 uploads bucket (recordings, documents, Transcribe output) | Storage; PUT; GET; data out to the internet for playback | $0.024 per GB-month; $0.0053 per 1,000 PUT; $0.0042 per 10,000 GET; $0.09 per GB out (first 10 TB) | 100 GB per month of data transfer out to the internet, aggregated across the account | 17.8 GB stored at steady state (3 months of recordings plus Transcribe output); 2,120 PUT; 3,600 GET; 11.7 GB played back | **$0.44** / $1.49 |
| Amazon SES (notifications and invitations) | Per recipient; attachments per GB | $0.0001 per recipient ($0.10 per 1,000); $0.12 per GB of attachments | 3,000 messages per month for 12 months on accounts that still have the 12-month free tier (unverified, see note) | 850 emails, no attachments | **$0.085** / same |
| ACM certificate (us-east-1, for CloudFront) | Nothing for public certificates (unverified: page blocked) | n/a | n/a | 1 | **$0.00** |
| Route 53 records in an **existing** hosted zone | Queries; the zone itself is not created by this profile | $0.40 per 1M queries; queries to alias records pointing at CloudFront are free; a hosted zone would be $0.50 per month | None | Alias records: free; if a CNAME is used instead, ~100,000 queries | **$0.00-0.04** |
| IAM roles, GitHub OIDC provider, Lambda event source mapping, S3 lifecycle rules, bucket policies, CORS | Not billed | n/a | n/a | n/a | **$0.00** |
| **Total, AWS side, 200 meetings a month** | | | | | **about $0.55** with the always-free allowances; **about $2.50** if no free tier applied at all |
| **Total in a month with no meetings and no sign-ins** | | | | | **under $0.01** (the web bucket); $0.27 if no free tier applied (idle SQS polling and the nightly job) |

What is genuinely fixed, in the sense of being there even when nobody uses the
system, is the web bucket's few megabytes and the nightly job: fractions of a
cent. The S3 uploads bucket, SES and the Lambda compute scale with meetings
and sit in the table because they are small enough to treat as overhead.

**The AWS free tier changed on 15 July 2025.** According to several
third-party summaries (the AWS free-tier page itself could not be opened; see
section 8), accounts created on or after that date get a credit-based "Free
plan" (up to USD 200 of credits for up to six months) or a "Paid plan" instead
of the old 12-month free tier, while the *always-free* allowances used in the
table (Lambda, SQS, CloudFront, EventBridge Scheduler, CloudWatch, KMS, the
100 GB of data transfer) continue for all accounts. The 12-month offers quoted
by many guides (Transcribe 60 minutes a month, SES 3,000 messages a month, S3
5 GB) therefore apply only to accounts created before that date. The table
above does not rely on any 12-month offer.

### 2.3 Two things in the table that deserve a sentence each

**Idle SQS polling.** A Lambda event source mapping keeps long-polling the
queue when it is empty, and empty `ReceiveMessage` calls are billed like any
other request. The widely used estimate is 5 pollers x 3 calls per minute
(20-second long polls) x 43,200 minutes = 648,000 requests a month, about
$0.26 at the London price. This sits inside the 1,000,000 always-free
requests, so it costs nothing unless another workload in the same account uses
up that allowance. It is the single biggest "fixed" line if the free tier does
not apply, which is why it is called out here. The `NumberOfEmptyReceives`
metric on the queue shows the real figure after the first week. (Source: a
third-party pricing guide; the Lambda documentation page on SQS event source
mappings could not be opened.)

**Lambda waiting on OpenRouter.** The worker is billed for wall-clock time,
including the one to two minutes it spends waiting for the model to answer.
At 2,048 MB that is about 240 GB-s per analysis, or roughly 0.3 cents at the
arm64 list price; 200 analyses are about $0.64 before the free tier. It is still small,
but it is the reason the worker, not the API, dominates Lambda usage.

---

## 3. Variable costs per meeting

The per-meeting arithmetic uses verified unit prices; the token counts and
durations are assumptions.

### 3.1 Transcription

Amazon Transcribe batch transcription in London is billed per second of audio
at **$0.0001 per second** (`EUW2-TranscribeAudio`, verified in the AWS price
list published 11 September 2026; the US East price in the same list is
identical). That is **$0.006 per minute**.

> **Check this figure before budgeting.** Most published guides, and AWS's own
> pricing examples until at least early 2026, quote **$0.024 per minute** for
> Tier 1 batch transcription. The pricing page could not be opened from the
> research environment to see how AWS presents the change, so the arithmetic
> below is shown at both rates. The price list is what AWS bills from, but the
> first real invoice should confirm it.

| Case | Arithmetic | Per meeting |
| --- | --- | --- |
| 30-minute recording uploaded, price-list rate | 1,800 s x $0.0001 | **$0.18** |
| 30-minute recording uploaded, older published rate | 30 min x $0.024 | **$0.72** |
| Teams transcript uploaded (no audio) | The worker skips Transcribe entirely | **$0.00** |
| Storing the recording for 90 days | 30 MB x 3 months x $0.024 per GB-month | $0.002 |

Speaker identification is part of the standard job. Add-ons the application
does not use would add to this: PII redaction is a further $0.00004 per second
in London; custom language models are a separate per-second rate.

The cheapest meeting is one where the tutor uploads the Teams transcript: the
transcription line is zero and only the model call remains.

### 3.2 Language model (OpenRouter, `anthropic/claude-sonnet-5.5`)

Prices from OpenRouter's models API, read on 6 October 2026 (verified):

| Price | Per token | Per 1M tokens |
| --- | --- | --- |
| Input (prompt) | $0.000002 | **$2.00** |
| Output (completion) | $0.00001 | **$10.00** |
| Cached input, read | $0.0000002 | $0.20 |
| Cached input, write (5 min / 1 h) | $0.0000025 / $0.000004 | $2.50 / $4.00 |
| Batch variant (`anthropic/claude-sonnet-5.5:batch`) | $0.000001 in, $0.000005 out | $1.00 / $5.00 |

Context length 1,000,000 tokens; maximum output 128,000 tokens.

| Call | Assumption | Arithmetic | Cost |
| --- | --- | --- | --- |
| One meeting review | 20,000 input tokens (transcript, documents, criteria, prompt) and 3,000 output tokens (report JSON) | 20,000 x $2.00/1M = $0.040; 3,000 x $10.00/1M = $0.030 | **$0.070** |
| One appraisal summary | 10,000 input tokens (statistics and short report summaries, per the data-protection design) and 2,000 output tokens (assumption) | 10,000 x $2.00/1M = $0.020; 2,000 x $10.00/1M = $0.020 | **$0.040** |
| Both | | | **$0.11** |

A 60-minute meeting roughly doubles the transcript and therefore the input
tokens of the review (about $0.11 for the review alone). Output tokens cost
five times input tokens, so the report length matters more than it looks.
If the prompt is restructured so the criteria and instructions form a stable
prefix, prompt caching would bill that prefix at $0.20 per 1M on re-use; the
application does not do this today, so no saving is assumed.

OpenRouter bills separately from AWS, against prepaid credits, and adds its
own fee when credits are bought (the amount could not be verified; check the
OpenRouter pricing page).

### 3.3 Per-meeting totals and monthly variable cost

| Meeting type | Transcribe | Model | AWS plumbing (Lambda, SQS, SES, S3 requests at list price, all inside free tiers in practice) | Per meeting | 200 meetings |
| --- | --- | --- | --- | --- | --- |
| Recording, price-list Transcribe rate | $0.18 | $0.11 | about $0.005 | **about $0.29** | **about $58** |
| Recording, older published Transcribe rate | $0.72 | $0.11 | about $0.005 | **about $0.83** | **about $166** |
| Teams transcript uploaded | $0.00 | $0.11 | about $0.005 | **about $0.11** | **about $22** |

So at 200 meetings a month the bill is roughly USD 20-60 (or up to about
USD 170 if the older Transcribe rate turns out to be the one charged), almost
all of it Transcribe and OpenRouter, on top of well under USD 1 of hosting.
Encouraging tutors to upload Teams transcripts is the biggest lever.

---

## 4. Comparison with the always-on container profile

The container profile keeps the same variable costs (Transcribe, OpenRouter,
S3, SES) and adds hourly charges. London prices verified from the AWS price
list, 730 hours a month, defaults from `infra/terraform/variables.tf`
(`api_cpu = 512`, `api_memory = 1024`, one task, `db.t4g.micro`, 20 GiB gp3,
single AZ):

| Always-on resource | London unit price (verified) | Arithmetic | Estimated monthly cost |
| --- | --- | --- | --- |
| NAT gateway (1) | $0.05 per hour; $0.05 per GB processed | $0.05 x 730 + 5 GB x $0.05 | **$36.75** |
| Application Load Balancer | $0.02646 per hour; $0.0084 per LCU-hour | $0.02646 x 730 + ~0.1 LCU x $0.0084 x 730 (traffic this low uses a fraction of one LCU) | **$19.93** |
| Public IPv4 addresses (1 NAT EIP + 2 ALB addresses, one per AZ) | $0.005 per address-hour, in use or idle | 3 x $0.005 x 730 | **$10.95** |
| ECS Fargate task, 0.5 vCPU / 1 GB, x86, always on | $0.04656 per vCPU-hour; $0.00511 per GB-hour | 0.5 x $0.04656 x 730 + 1 x $0.00511 x 730 | **$20.72** |
| RDS PostgreSQL `db.t4g.micro`, single AZ | $0.018 per hour; gp3 $0.133 per GB-month; backups within the free allocation | $0.018 x 730 + 20 x $0.133 | **$15.80** |
| Secrets Manager (5 secrets) | $0.40 per secret-month; $0.05 per 10,000 API calls | 5 x $0.40 + a few thousand calls | **$2.01** |
| ECR image storage (~1 GB) | $0.10 per GB-month | | **$0.10** |
| CloudFront, S3, SES, CloudWatch Logs (30-day retention), ACM (2 certificates) | Same as the serverless profile; both certificates free | | about $0.60 |
| **Fixed total before any meeting** | | | **about $107 a month** |
| Pay-per-request profile, fixed total (section 2) | | | **about $0.55 a month** (under $0.01 idle) |

Multi-AZ RDS (`db_multi_az = true`) roughly doubles the database line; a
second API task adds another $20.72; Container Insights, if enabled, adds
custom-metric charges. Fargate on ARM (`$0.03725` per vCPU-hour, `$0.00409`
per GB-hour) would save about $4 of the $20.72 but needs an ARM image.

What the container profile buys for the extra ~$106: no cold starts, a
database that is never paused and has no internet-facing endpoint, jobs
longer than 15 minutes, and a familiar operating model. The deployment guide's
"Which profile to choose" table covers when that is worth it.

---

## 5. The database decision

The application needs one PostgreSQL database. The profile offers two ways to
get one without an hourly instance charge, selected by `database_mode`.

### 5.1 `external` (default): a managed PostgreSQL with a free tier, in London

Terraform only reads `/meeting-review/<env>/DATABASE_URL` from SSM; the team
creates the database with a provider that has an AWS London region and
enforces TLS. Examples, from search-result snippets dated 2026 because the
providers' pricing pages could not be opened (all **unverified**, check the
current plan pages):

| Provider | Free plan as reported | London |
| --- | --- | --- |
| Neon | 0.5 GB storage per project, 100 compute-hours per month, scale-to-zero (suspended computes do not use hours), autoscaling up to 2 CU, up to 100 projects | `aws-eu-west-2` listed in Neon's regions documentation |
| Supabase | 500 MB database, 5 GB egress, 2 active projects; **free projects are paused after one week without activity** and must be restored by hand | Region list not confirmed |

Fit for this application: the database holds metadata, transcripts, reports
and the audit log, not files. 200 meetings a month with transcripts of a few
tens of kilobytes plus reports is on the order of 10-20 MB a month, so a
0.5 GB allowance lasts a long time at the default 730-day transcript
retention; check the size in the provider's dashboard quarterly. 100
compute-hours a month on a scale-to-zero plan covers office-hours use at the
minimum compute size (about 200 awake hours x 0.25 CU = 50 CU-hours) but would
be exceeded by a workload that keeps the database awake around the clock, at
which point the provider's first paid plan applies. A provider that pauses
free projects after a week of inactivity (Supabase's reported behaviour) is a
poor fit for a system that may be quiet over a holiday.

Cost: **$0 a month** on a free plan; the first paid tiers are typically in the
USD 10-25 range (unverified).

Data-protection notes for the DPO (see [data-protection.md](data-protection.md)):

- The provider is a **processor** holding transcripts and personal data; it
  must appear in the DPIA with a data processing agreement. Several providers
  are US companies even when the data sits in AWS London; the DPIA should
  record where support staff can access data from and whether a UK
  international data transfer agreement or IDTA addendum is needed.
- The endpoint is **public and TLS-protected** (append `?sslmode=require` if
  the provider does not enforce it). This is the same posture as Aurora mode
  below; neither hides the database inside a VPC.
- Check the free plan's **backup and point-in-time-restore window**; free
  plans commonly offer a short window or none. Export a logical backup
  (`pg_dump`) on a schedule if the window is short.
- Free plans can be withdrawn or changed by the provider; keep a tested
  migration path to Aurora mode (`pg_dump` / `pg_restore`, then switch the
  SSM parameter and `terraform apply`).

### 5.2 `aurora_serverless_v2`: Aurora PostgreSQL Serverless v2 scaling to 0 ACU

Terraform creates a dedicated VPC with public subnets only, one publicly
accessible Serverless v2 instance with `min_capacity = 0` and
`max_capacity = 1`, `rds.force_ssl = 1`, a 32+ character random master
password stored in SSM, deletion protection and 7-day backups. The Lambdas stay
outside the VPC, so there is no NAT gateway.

Verified London prices (AWS price list published 6 October 2026):

| Item | Price |
| --- | --- |
| Serverless v2 capacity (Aurora Standard) | **$0.14 per ACU-hour** (I/O-Optimized would be $0.19; not used) |
| Storage | $0.10 per GB-month of consumed storage |
| I/O | $0.20 per 1M requests |
| Backup storage beyond the free allocation (100% of cluster storage, unverified) | $0.022 per GB-month |
| Public IPv4 address attached to the publicly accessible instance | **$0.005 per hour = $3.65 per month**. AWS stated at launch that the IPv4 charge applies to RDS instances (unverified: blog page blocked; the price itself is verified) |

Scaling to zero (unverified: the documentation page could not be opened;
figures from search-result snippets of that page and the November 2024
announcement): minimum capacity 0 ACU is supported for Aurora PostgreSQL
**13.15+, 14.12+, 15.7+ and 16.3+**; Aurora PostgreSQL 17 is not named in the
snippets, so **pin a 16.x minor version of at least 16.3** and verify the
version before the first apply. The instance pauses after
`SecondsUntilAutoPause` with no connections initiated by user activity
(default and minimum 300 s, maximum 86,400 s); instance capacity is not
charged while paused, storage is; resuming takes roughly 15 seconds (the first
request after a pause waits for it).

Estimates at the college's usage:

| Scenario | Arithmetic | Estimated monthly cost |
| --- | --- | --- |
| Awake during office hours only: 9 h x 22 days + nightly job + deploys = ~202 h at the 0.5 ACU floor | 101 ACU-h x $0.14 + $3.65 IPv4 + 2 GB x $0.10 + 2M I/O x $0.20/1M | **about $18** |
| Never pauses (something keeps a connection open) | 0.5 ACU x 730 h x $0.14 + $3.65 + storage | **about $55** |
| Idle month, paused throughout | $3.65 IPv4 + 2 GB x $0.10 | **about $3.85** |

Two caveats that decide which row applies:

- **Warm Lambda environments hold database connections.** Lambda freezes an
  execution environment between invocations without closing its sockets, so
  from the database's point of view a connection can stay open for several
  minutes after the last request, delaying the pause. Keep Prisma's pool at
  one connection per environment and accept that the effective idle period is
  the auto-pause timeout plus Lambda's environment lifetime (a few minutes to
  about a quarter of an hour).
- **The public IPv4 charge alone is USD 3.65 a month**, so Aurora mode cannot
  meet the "cents" promise even when idle. It is the right choice when the
  college wants the database inside its own AWS account under its own
  contract and backups, and accepts single-digit to low-double-digit dollars a
  month for it.

Data-protection notes: the data stays in the college's AWS account in London
under the existing AWS data processing terms; encryption at rest is on by
default for Aurora; backups are 7 days with point-in-time restore. The
trade-off to state plainly is that the endpoint is public (`0.0.0.0/0` on
5432) and relies on TLS being enforced server-side plus a long random
password, because the alternative, a private endpoint, forces the Lambdas into
the VPC and needs a NAT gateway ($36.50 a month, section 4) or interface
endpoints ($8.03 per endpoint per AZ per month, section 6) for Transcribe,
SES, SQS and OpenRouter.

### 5.3 Recommendation

Start with `external` on a free plan in London for the pilot, with the DPIA
entry and a scheduled `pg_dump`. Move to `aurora_serverless_v2` if the
provider's free plan no longer fits (storage, compute hours, pausing rules) or
the DPO prefers a single processor; budget about USD 18 a month for it at
office-hours use.

---

## 6. What breaks the "cents" promise and how the Terraform avoids it

Each item below is an hourly or per-month charge that is easy to add by
accident. The "how to check" column is a grep against
`infra/terraform-serverless` that should return nothing (or only the noted
exception) after any change.

| Item | London price (verified) | What it would add per month | How the profile avoids it | How to check |
| --- | --- | --- | --- | --- |
| NAT gateway | $0.05 per hour + $0.05 per GB | **$36.50** + data | The three Lambdas have no `vpc_config`, so they reach SQS, S3, Transcribe, SES, SSM and OpenRouter over the public AWS endpoints and the internet; in Aurora mode the cluster sits in public subnets so nothing private needs a route out | `grep -r -e aws_nat_gateway -e vpc_config infra/terraform-serverless` returns nothing |
| Application Load Balancer | $0.02646 per hour + $0.0084 per LCU-hour + 2 public IPv4 at $0.005 per hour | **$26.6+** | CloudFront calls the API Lambda's function URL directly as a custom origin, with `X-Origin-Verify` instead of an IAM-signed origin | `grep -r aws_lb infra/terraform-serverless` returns nothing |
| ECS/Fargate task, EC2 instance | $0.04656 per vCPU-hour, $0.00511 per GB-hour (Fargate x86) | **$20.72** for 0.5 vCPU/1 GB | Lambda only | `grep -r -e aws_ecs -e aws_instance infra/terraform-serverless` returns nothing |
| RDS instance | $0.018 per hour for `db.t4g.micro` + $0.133 per GB-month gp3 | **$15.80** | `external` database, or Aurora Serverless v2 with `min_capacity = 0` | `grep -r aws_db_instance infra/terraform-serverless` returns only the Serverless v2 instance (`instance_class = "db.serverless"`) guarded by `database_mode` |
| Aurora kept awake or I/O-Optimized | $0.14 per ACU-hour ($0.19 I/O-Optimized) | **$51** at 0.5 ACU around the clock | `min_capacity = 0`, `max_capacity = 1`, Aurora Standard storage type, no Performance Insights or Enhanced Monitoring (which also generate CloudWatch Logs charges) | `grep -r -e min_capacity -e storage_type -e performance_insights -e monitoring_interval infra/terraform-serverless` shows 0, standard/absent, false/absent, 0/absent |
| Public IPv4 addresses | $0.005 per address-hour | **$3.65 each** | None in `external` mode (no VPC at all). One in Aurora mode, unavoidable for a publicly accessible instance; it is the reason Aurora mode is "a few dollars", not "cents" | `grep -r aws_eip infra/terraform-serverless` returns nothing |
| VPC interface endpoints (PrivateLink) | $0.011 per endpoint-hour per AZ + $0.01 per GB | **$8.03 per endpoint per AZ** (Transcribe, SES, SQS, SSM, Logs in two AZs would be about $80) | Lambdas are outside the VPC; nothing needs private connectivity | `grep -r aws_vpc_endpoint infra/terraform-serverless` returns nothing (the container profile's S3 *gateway* endpoint is free, but is not needed here either) |
| RDS Proxy | $0.017 per vCPU-hour; $0.018 per ACU-hour on Serverless v2 | **$6.57+** | Not created; Prisma connects directly with a small pool | `grep -r aws_db_proxy infra/terraform-serverless` returns nothing |
| Secrets Manager | $0.40 per secret-month + $0.05 per 10,000 API calls | **$2.00** for five secrets | SSM Parameter Store SecureString parameters in the **standard** tier (no charge); values stay under the 4 KB standard limit | `grep -r aws_secretsmanager infra/terraform-serverless` returns nothing; `grep -r "tier" ` shows no `Advanced` |
| Lambda provisioned concurrency | $0.0000048304 per GB-s (plus a lower duration rate) | **$12.69** for 1 GB kept warm around the clock | Not configured; cold starts of roughly 1-3 s are accepted | `grep -r provisioned_concurrency infra/terraform-serverless` returns nothing |
| Lambda inside a VPC | No direct charge | Forces a NAT gateway or endpoints (above) | No `vpc_config` | as for NAT gateway |
| Route 53 hosted zone | $0.50 per zone-month (first 25) | **$0.50** | `route53_zone_id` is an optional input; records are created only when it is given; no `aws_route53_zone` resource. Alias records to CloudFront are free to query | `grep -r aws_route53_zone\b infra/terraform-serverless` returns nothing |
| CloudWatch alarms and dashboards | $0.10 per alarm-month beyond 10 free (standard resolution); dashboards: price not in the London price list, commonly quoted at $3 per dashboard-month beyond 3 (unverified) | $0.10-3 per item | None created; AWS Budgets (free) does the alerting, section 7 | `grep -r -e aws_cloudwatch_metric_alarm -e aws_cloudwatch_dashboard infra/terraform-serverless` returns nothing |
| CloudWatch Logs volume and retention | $0.5985 per GB ingested; $0.0315 per GB-month | A `debug` log level could multiply ingestion tenfold | `LOG_LEVEL=info`, 14-day retention on all three log groups; no Lambda Insights extension | `grep -r retention_in_days` shows 14 |
| Customer-managed KMS keys | $1 per key-version-month + requests | $1 each | AWS-managed keys (`aws/ssm`, SSE-S3) | `grep -r aws_kms_key infra/terraform-serverless` returns nothing |
| S3 versioning, missing lifecycle rules | Storage grows without bound | Grows with uploads | Versioning off on the uploads bucket; `recordings/` expires after `recording_retention_days`, `transcribe-output/` after 30 days, incomplete multipart uploads aborted after 7 days (expiration itself is not charged) | `grep -r aws_s3_bucket_lifecycle_configuration` shows the three rules |
| CloudFront extras | Price class, real-time logs, WAF, Origin Shield | WAF adds fixed monthly fees; Origin Shield adds $0.009 per 10,000 requests | `PriceClass_100` (Europe and North America), no WAF, no real-time logs, no Origin Shield; `index.html` is served with no-cache so a deploy needs only one invalidation (first 1,000 paths a month free) | `grep -r price_class` shows `PriceClass_100` |
| Transcribe and SES add-ons | PII redaction $0.00004 per second; SES dedicated IPs, Virtual Deliverability Manager | Per use | Not used by the application | n/a |

Two free settings reduce the *variable* risk rather than the fixed cost:
reserved concurrency on the worker (for example 5) caps how many Transcribe
and OpenRouter calls can run at once, and the dead-letter queue with
`maxReceiveCount = 3` bounds retries so a failing job cannot loop and bill
Transcribe three hundred times overnight.

---

## 7. How to watch the bill

1. **AWS Budgets, which are free.** Budget notifications cost nothing (price
   list: $0.00 per budget-day with no limit); only *action-enabled* budgets
   cost $0.10 per budget-day after 62 free budget-days a month, and budget
   reports $0.01 each. Create, in Billing -> Budgets:
   - a monthly **cost budget** of about **USD 5** (a few pounds) for the
     whole account, with alerts at 50% and 80% actual spend and at 100%
     *forecast* spend, emailed to the operations contact and the DPO;
   - a second cost budget filtered to **Amazon Transcribe** at the expected
     monthly figure from section 3 (about USD 40 at 200 recordings), so a
     surge in recordings is noticed within a day;
   - the **Free Tier usage alerts** in Billing preferences (free), which warn
     when a free allowance is 85% used, for example the SQS requests.
2. **Cost allocation tags.** The module applies `Project`, `Environment` and
   `ManagedBy` to every resource (the `common_tags` pattern from
   `infra/terraform/locals.tf`). Activate them once in Billing -> Cost
   allocation tags; they appear in Cost Explorer about 24 hours later and are
   not applied retroactively. Then group Cost Explorer by *Service* and filter
   by `Project = meeting-review` to see the profile's own lines separately
   from anything else in the account. The Cost Explorer console is free; its
   API costs $0.01 per request, so do not script it to run every minute.
3. **Cost Anomaly Detection** (AWS states no charge; not re-verified) sends
   an email when a service's spend deviates from its pattern. Enable it with
   the default service monitor.
4. **What to look at after the first week.** In CloudWatch (service metrics
   are free): the SQS `NumberOfEmptyReceives` metric tells you the real
   idle-polling figure from section 2.3; in Aurora mode,
   `ServerlessDatabaseCapacity` plotted over a day shows whether the cluster
   actually pauses; Lambda `Duration` for the worker shows how long OpenRouter
   calls take. In Cost Explorer, confirm the Transcribe rate on the first
   invoice against section 3.1.
5. **OpenRouter.** It bills separately against prepaid credits. Set a credit
   limit on the API key used by the Lambdas in the OpenRouter dashboard, keep
   that key in SSM only, and read the Activity page monthly; it shows tokens
   and cost per request so the review and appraisal assumptions in section 3.2
   can be corrected.
6. **The external database provider**, if used, has its own dashboard for
   storage and compute hours; check it against the free-plan limits
   quarterly, and set up the provider's usage emails if it offers them.

A reasonable monthly routine is a ten-minute look at Cost Explorer grouped by
service, the OpenRouter Activity page and the database dashboard, with the
Budgets alerts as the safety net in between.

---

## 8. Sources, and what could not be verified

**Research date: 6 October 2026.** The research environment's egress proxy
blocked `aws.amazon.com`, `docs.aws.amazon.com`, `docs.aws.eu`,
`openrouter.ai/anthropic/...` (the model page), `neon.com`, `supabase.com`
and `cur.vantage.sh`. The following official machine-readable sources were
reachable and are the basis of every figure marked *verified*:

- **AWS Price List Bulk API** (the data AWS bills from and that the pricing
  pages render), per-service offer files for `eu-west-2`:
  `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<ServiceCode>/current/eu-west-2/index.json`
  (global services use `.../current/index.json`). Service codes and the
  publication date of each file read:
  `AWSLambda` 2026-10-01, `AWSQueueService` 2026-09-11, `AmazonS3`
  2026-09-28, `AWSDataTransfer` 2026-09-16, `AmazonCloudFront` (global)
  2026-10-03, `AWSEvents` 2026-09-24, `AWSSystemsManager` 2026-10-04,
  `awskms` 2026-09-11, `AmazonCloudWatch` 2026-09-22, `AmazonRDS` 2026-10-06,
  `transcribe` (`eu-west-2` and `us-east-1`) 2026-09-11, `AmazonSES`
  2026-09-11, `AmazonRoute53` (global) 2026-09-11, `AmazonECS` (Fargate)
  2026-09-11, `AWSELB` 2026-09-11, `AmazonVPC` 2026-09-17, `AmazonEC2` (NAT
  gateway lines, CSV) 2026-09-25, `AWSSecretsManager` 2026-09-11, `AmazonECR`
  2026-09-11, `AWSBudgets` (global) 2026-09-11, `AWSCostExplorer` (global)
  2026-09-11. The service index listing them all is
  `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json`
  (published 2026-10-06T13:21Z).
- **OpenRouter models API**: `https://openrouter.ai/api/v1/models`, read
  2026-10-06T13:37Z; entry `anthropic/claude-sonnet-5.5` (created 2026-09-28),
  `pricing.prompt = 0.000002`, `pricing.completion = 0.00001`,
  `input_cache_read = 0.0000002`, `input_cache_write = 0.0000025`,
  `input_cache_write_1h = 0.000004`; the `:batch` variant at half those rates.

### Verified unit prices (London unless global)

| Service | Figure | Price-list line |
| --- | --- | --- |
| Lambda | $0.0000002 per request; $0.0000166667 per GB-s x86 (first 6 billion GB-s), $0.0000133334 Arm; ephemeral storage $0.0000000358 per GB-s; provisioned concurrency $0.0000048304 per GB-s; free tier 1,000,000 requests and 400,000 GB-s per month | `EUW2-Request`, `EUW2-Lambda-GB-Second`, `EUW2-Lambda-GB-Second-ARM`, `EUW2-Lambda-Storage-GB-Second`, `EUW2-Lambda-Provisioned-Concurrency`, `Global-Request`, `Global-Lambda-GB-Second` |
| SQS | $0.40 per 1M standard requests (first 100 billion); FIFO $0.50; "First 1,000,000 Amazon SQS Requests per month are free" | `EUW2-Requests-Tier1`, `EUW2-Requests-FIFO-Tier1`, `Global-Requests` |
| CloudFront | Europe $0.085 per GB (first 10 TB); $0.012 per 10,000 HTTPS requests; $0.009 per 10,000 HTTP; $0.020 per GB to origin; Functions $0.10 per 1M after 2M free; invalidations $0.005 per path after 1,000 free; free tier "First 1 TB of data transfer" and "First 10 Million HTTP/S requests" | `EU-DataTransfer-Out-Bytes`, `EU-Requests-Tier2-HTTPS`, `EU-Requests-Tier1`, `EU-DataTransfer-Out-OBytes`, `Executions-CloudFrontFunctions`, `Invalidations`, `Global-DataTransfer-Out-Bytes`, `Global-Requests-Tier1` |
| S3 | $0.024 per GB-month Standard (first 50 TB); $0.0053 per 1,000 PUT/COPY/POST/LIST; $0.0042 per 10,000 GET; data out $0.09 per GB (first 10 TB) after 100 GB per month free globally | `EUW2-TimedStorage-ByteHrs`, `EUW2-Requests-Tier1`, `EUW2-Requests-Tier2`, `EUW2-DataTransfer-Out-Bytes`, `Global-DataTransfer-Out-Bytes` (AWSDataTransfer) |
| EventBridge Scheduler | first 14,000,000 scheduled invocations free; $1.15 per 1M after (London) | `EUW2-ScheduledInvocation` |
| SSM Parameter Store | Advanced parameters $0.05 per parameter-month; $0.05 per 10,000 API interactions for advanced/higher throughput; no line item exists for standard parameters | `EUW2-PS-Advanced-Param-Tier1`, `EUW2-PS-Param-Processed-Tier1/2` |
| KMS | $0.03 per 10,000 requests after 20,000 free; $1 per customer-managed key version per month | `eu-west-2-KMS-Requests`, `Global-KMS-Requests`, `eu-west-2-KMS-Keys` |
| CloudWatch | Logs $0.5985 per GB ingested (Standard), $0.0315 per GB-month stored, 5 GB ingested free; alarms $0.10 per alarm-month (standard), 10 free; metrics $0.30 per metric-month, 10 free; Logs Insights $0.0059 per GB scanned, 5 GB free | `EUW2-DataProcessing-Bytes`, `EUW2-TimedStorage-ByteHrs`, `Global-DataProcessing-Bytes`, `EUW2-CW:AlarmMonitorUsage`, `Global-CW:AlarmMonitorUsage`, `EUW2-CW:MetricMonitorUsage`, `EUW2-DataScanned-Bytes` |
| Aurora PostgreSQL | $0.14 per ACU-hour Serverless v2 (Standard), $0.19 I/O-Optimized; $0.10 per GB-month storage; $0.20 per 1M I/O; $0.022 per GB-month backup beyond the free allocation | `EUW2-Aurora:ServerlessV2Usage`, `EUW2-Aurora:ServerlessV2IOOptimizedUsage`, `EUW2-Aurora:StorageUsage`, `EUW2-Aurora:StorageIOUsage`, `EUW2-Aurora:BackupUsage` |
| RDS PostgreSQL | `db.t4g.micro` $0.018 per hour, `db.t3.micro` $0.021, `db.t4g.small` $0.036 (single AZ); gp3 $0.133 per GB-month; backup $0.10 per GB-month beyond free; RDS Proxy $0.017 per vCPU-hour, $0.018 per ACU-hour | `EUW2-InstanceUsage:db.t4g.micro` etc., `EUW2-RDS:GP3-Storage`, `EUW2-RDS:ChargedBackupUsage`, `EUW2-RDS:ProxyUsage`, `EUW2-RDS:Proxy-ASv2-Usage` |
| Transcribe | batch $0.0001 per second (flat, London and US East); streaming $0.0001667 per second; PII redaction add-on $0.00004 per second (first tier) | `EUW2-TranscribeAudio`, `USE1-TranscribeAudio`, `EUW2-StreamingAudio`, `EUW2-RedactionTranscribeAudio` |
| SES | $0.0001 per recipient; $0.12 per GB of attachments; managed dedicated IPs $0.00008 per email under 10M | `EUW2-Recipients`, `EUW2-AttachmentsSize-Bytes`, `EUW2-Recipients-DIP-Managed` |
| Route 53 | $0.50 per hosted zone-month (first 25), $0.10 after; $0.40 per 1M queries (first billion); alias queries free; health checks $0.50 (AWS endpoints, after 50 free) / $0.75 (non-AWS) | `HostedZone`, `DNS-Queries`, `Intra-AWS-DNS-Queries`, `Health-Check-AWS`, `Health-Check-Non-AWS` |
| Fargate | x86 $0.04656 per vCPU-hour, $0.00511 per GB-hour; Arm $0.03725 / $0.00409; ephemeral storage $0.000129 per GB-hour | `EUW2-Fargate-vCPU-Hours:perCPU`, `EUW2-Fargate-GB-Hours`, `EUW2-Fargate-ARM-*`, `EUW2-Fargate-EphemeralStorage-GB-Hours` |
| ALB | $0.02646 per hour; $0.0084 per LCU-hour | `EUW2-LoadBalancerUsage` (Application), `EUW2-LCUUsage` |
| NAT gateway | $0.05 per hour; $0.05 per GB processed | `NAT Gateway` product family in `AmazonEC2`, eu-west-2 |
| Public IPv4 | $0.005 per hour, in use or idle | `EUW2-PublicIPv4:InUseAddress`, `EUW2-PublicIPv4:IdleAddress` |
| VPC interface endpoint | $0.011 per endpoint-hour; $0.01 per GB (first 1 PB) | `EUW2-VpcEndpoint-Hours`, `EUW2-VpcEndpoint-Bytes` |
| Secrets Manager | $0.40 per secret-month; $0.05 per 10,000 API requests | `EUW2-AWSSecretsManager-Secrets`, `EUW2-AWSSecretsManagerAPIRequest` |
| ECR | $0.10 per GB-month | `EUW2-TimedStorage-ByteHrs` |
| Budgets | $0.00 per budget-day for notifications; action-enabled budgets $0.10 per budget-day after 62 free; reports $0.01 each | `BudgetsUsage`, `ActionEnabledBudgetsUsage`, `BudgetsReports` |
| Cost Explorer | API $0.01 per request | `USE1-APIRequest` |
| OpenRouter `anthropic/claude-sonnet-5.5` | $2.00 per 1M input, $10.00 per 1M output, cache read $0.20, cache write $2.50 / $4.00 (1 h); batch $1.00 / $5.00; 1,000,000 context, 128,000 max output | models API, see above |

### Unverified figures and statements (confirm before relying on them)

| Statement | Why it is unverified | Where it came from |
| --- | --- | --- |
| Transcribe's public price presentation (whether $0.006 per minute now replaces the long-quoted $0.024 per minute Tier 1 rate) | `aws.amazon.com/transcribe/pricing/` blocked; the price list shows $0.0001 per second flat in London and US East | Price list vs. third-party guides found by search |
| Transcribe free tier (60 minutes a month for 12 months) | Pricing page blocked | Search snippet of the pricing page |
| SES free tier (3,000 messages a month for 12 months after first use) | Pricing page blocked | Search snippet of the pricing page |
| S3 12-month free tier (5 GB, 20,000 GET, 2,000 PUT) | Free-tier page blocked; does not apply to accounts created after 15 July 2025 | Search snippets |
| The July 2025 free-tier change (credit-based Free plan, always-free offers retained, 12-month offers withdrawn for new accounts) | `aws.amazon.com/free` blocked | Third-party summaries (dev.to, rackspace blog) found by search |
| Standard SSM parameters and standard throughput are free | Pricing page blocked; inferred from the absence of a billable line item in the price list | Search results and AWS pricing page wording as remembered |
| Lambda function URLs carry no charge beyond requests and duration | AWS "What's New" page blocked | Search snippet of the April 2022 announcement |
| ACM public certificates are free | Page blocked | Search snippets |
| CloudWatch dashboards price ($3 per dashboard-month beyond 3 free) | Not present in the London price-list file; pricing page blocked | Commonly published figure |
| Aurora backup free allocation equals 100% of cluster storage | Documentation blocked | Commonly published |
| Aurora Serverless v2 0-ACU engine versions (13.15+, 14.12+, 15.7+, 16.3+), auto-pause default 300 s and range 300-86,400 s, ~15 s resume, no capacity charge while paused | `docs.aws.amazon.com/.../aurora-serverless-v2-auto-pause.html` and the November 2024 announcement blocked | Search snippets of those pages |
| The public IPv4 charge applies to publicly accessible RDS instances | AWS News Blog (July 2023) blocked; the $0.005 per hour price is verified | Search snippet of the blog post |
| Idle SQS polling by Lambda: 5 pollers, 20-second long polls, about 648,000 empty receives a month | Lambda documentation blocked | Third-party pricing guide found by search |
| Neon free plan (0.5 GB per project, 100 compute-hours a month, scale-to-zero, `aws-eu-west-2` region) and Supabase free plan (500 MB, pauses after 7 days) | Provider pages blocked | Search snippets dated 2026 |
| OpenRouter's fee on credit purchases | Pricing page blocked | Not quoted; check the OpenRouter pricing page |
| Cost Anomaly Detection is free of charge | Page blocked | Commonly published |
| CloudFront flat-rate plans (Free, Pro, Business, Premium) and their prices | The `CloudFrontPlans` price-list file lists the plans but its flat-rate terms could not be parsed; marketing page blocked | Search snippet of the November 2025 announcement; not used by this profile, which relies on the pay-as-you-go free tier |

Usage figures (durations, token counts, bytes, hours awake) are the document's
own assumptions from section 2.1 and are not sourced from anywhere; measure
them after the first month and update this file.
