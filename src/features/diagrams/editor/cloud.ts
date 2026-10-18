// Official AWS, Azure and Google Cloud architecture icons, a curated set (see
// cloud-icons/README.md for where each set comes from and its terms). Keys are
// saved in diagrams: never rename one.
//
// Each file is its own asset (never inlined), so the browser only downloads the
// icons a diagram or the open panel actually shows.
const files = import.meta.glob<string>('./cloud-icons/*/*.svg', { query: '?url&no-inline', import: 'default', eager: true })

export type CloudProvider = 'AWS' | 'Azure' | 'Google Cloud'

const folder: Record<CloudProvider, string> = { AWS: 'aws', Azure: 'azure', 'Google Cloud': 'gcp' }
const prefix: Record<CloudProvider, string> = { AWS: 'aws', Azure: 'azure', 'Google Cloud': 'gcp' }

// Labels are each service's full name, as the providers ask.
const names: Record<CloudProvider, Record<string, string>> = {
  AWS: {
    ec2: 'Amazon EC2', lambda: 'AWS Lambda', s3: 'Amazon S3', rds: 'Amazon RDS', aurora: 'Amazon Aurora', dynamodb: 'Amazon DynamoDB',
    elasticache: 'Amazon ElastiCache', opensearch: 'Amazon OpenSearch Service', redshift: 'Amazon Redshift', athena: 'Amazon Athena',
    glue: 'AWS Glue', kinesis: 'Amazon Kinesis', 'api-gateway': 'Amazon API Gateway', cloudfront: 'Amazon CloudFront',
    'route-53': 'Amazon Route 53', elb: 'Elastic Load Balancing', vpc: 'Amazon VPC', sqs: 'Amazon SQS', sns: 'Amazon SNS',
    eventbridge: 'Amazon EventBridge', 'step-functions': 'AWS Step Functions', ecs: 'Amazon ECS', eks: 'Amazon EKS', fargate: 'AWS Fargate',
    ecr: 'Amazon ECR', 'app-runner': 'AWS App Runner', 'elastic-beanstalk': 'AWS Elastic Beanstalk', amplify: 'AWS Amplify',
    cognito: 'Amazon Cognito', iam: 'AWS IAM', 'secrets-manager': 'AWS Secrets Manager', kms: 'AWS KMS', waf: 'AWS WAF',
    cloudwatch: 'Amazon CloudWatch', cloudformation: 'AWS CloudFormation', bedrock: 'Amazon Bedrock', sagemaker: 'Amazon SageMaker',
  },
  Azure: {
    'virtual-machine': 'Azure Virtual Machines', 'app-service': 'Azure App Service', functions: 'Azure Functions',
    aks: 'Azure Kubernetes Service', 'container-apps': 'Azure Container Apps', 'container-registry': 'Azure Container Registry',
    'storage-account': 'Azure Storage', 'sql-database': 'Azure SQL Database', 'cosmos-db': 'Azure Cosmos DB',
    postgresql: 'Azure Database for PostgreSQL', 'cache-redis': 'Azure Cache for Redis', 'service-bus': 'Azure Service Bus',
    'event-hubs': 'Azure Event Hubs', 'event-grid': 'Azure Event Grid', 'logic-apps': 'Azure Logic Apps',
    'api-management': 'Azure API Management', 'front-door': 'Azure Front Door', 'application-gateway': 'Azure Application Gateway',
    'load-balancer': 'Azure Load Balancer', 'virtual-network': 'Azure Virtual Network', dns: 'Azure DNS', firewall: 'Azure Firewall',
    'key-vault': 'Azure Key Vault', 'managed-identity': 'Managed Identities', monitor: 'Azure Monitor',
    'application-insights': 'Application Insights', 'log-analytics': 'Log Analytics', openai: 'Azure OpenAI', 'ai-search': 'Azure AI Search',
    devops: 'Azure DevOps',
  },
  'Google Cloud': {
    'compute-engine': 'Compute Engine', 'cloud-run': 'Cloud Run', 'cloud-storage': 'Cloud Storage', 'cloud-sql': 'Cloud SQL',
    bigquery: 'BigQuery', gke: 'Google Kubernetes Engine', spanner: 'Cloud Spanner', alloydb: 'AlloyDB', 'vertex-ai': 'Vertex AI',
    apigee: 'Apigee', looker: 'Looker', 'cloud-functions': 'Cloud Functions', pubsub: 'Pub/Sub', firestore: 'Firestore',
    memorystore: 'Memorystore', bigtable: 'Bigtable', 'load-balancing': 'Cloud Load Balancing', 'cloud-cdn': 'Cloud CDN',
    'cloud-dns': 'Cloud DNS', vpc: 'VPC', 'cloud-nat': 'Cloud NAT', 'cloud-armor': 'Cloud Armor', iam: 'Cloud IAM',
    'secret-manager': 'Secret Manager', logging: 'Cloud Logging', monitoring: 'Cloud Monitoring', 'artifact-registry': 'Artifact Registry',
    'cloud-build': 'Cloud Build', 'app-engine': 'App Engine', dataflow: 'Dataflow', 'cloud-scheduler': 'Cloud Scheduler',
    'cloud-tasks': 'Cloud Tasks', 'api-gateway': 'API Gateway',
  },
}

export type CloudIcon = { label: string; provider: CloudProvider; src: string }

/** `aws-lambda` → { label, provider, src }. Only icons whose file exists. */
export const CLOUD_ICONS: Record<string, CloudIcon> = Object.fromEntries(
  (Object.keys(names) as CloudProvider[]).flatMap((provider) =>
    Object.entries(names[provider]).flatMap(([name, label]) => {
      const src = files[`./cloud-icons/${folder[provider]}/${name}.svg`]
      return src ? [[`${prefix[provider]}-${name}`, { label, provider, src }]] : []
    }),
  ),
)

export const CLOUD_PROVIDERS: CloudProvider[] = ['AWS', 'Azure', 'Google Cloud']
