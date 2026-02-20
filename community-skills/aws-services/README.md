# AWS Services

Manage AWS resources including S3 buckets, Lambda functions, and EC2 instances.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install aws-services
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessKeyId` | string | Yes | AWS access key ID |
| `secretAccessKey` | string | Yes | AWS secret access key |
| `region` | string | Yes | AWS region (e.g. `us-east-1`, `eu-west-1`) |
| `sessionToken` | string | No | AWS session token for temporary credentials |

## Tools

### List S3 Buckets (`aws_list_s3_buckets`)
List all S3 buckets in the account.

### Invoke Lambda (`aws_invoke_lambda`)
Invoke a Lambda function.

### List EC2 Instances (`aws_list_ec2`)
List running EC2 instances.

### CloudWatch Metrics (`aws_get_cloudwatch_metrics`)
Retrieve CloudWatch metrics.

## License

Apache-2.0
