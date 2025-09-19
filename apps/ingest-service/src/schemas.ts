import { z } from '@repo/workspace-dependencies/zod'

// Document schema
export const DocumentSchema = z
	.object({
		id: z.string(),
		text: z.string(),
		source: z.string(),
		url: z.string().optional(),
		metadata: z.record(z.any(), z.any()).optional(),
	})
	.describe('Document')
	.meta({
		ref: 'Document',
	})

// Processing options schema
export const ProcessingOptionsSchema = z
	.object({
		chunkSize: z.number().optional(),
		overlap: z.number().optional(),
		retryLimit: z.number().optional(),
		dlpEnabled: z.boolean().optional(),
	})
	.describe('Processing options')
	.meta({
		ref: 'ProcessingOptions',
	})

// Process document request schema
export const ProcessDocumentSchema = z
	.object({
		documents: z.array(DocumentSchema),
		options: ProcessingOptionsSchema.optional(),
	})
	.describe('Process documents request')
	.meta({
		ref: 'ProcessDocumentRequest',
	})

// Process result schema
export const ProcessResultSchema = z
	.object({
		documentId: z.string(),
		chunksCreated: z.number(),
		processingTime: z.number(),
		status: z.enum(['success', 'error']),
		error: z.string().optional(),
	})
	.describe('Process result')
	.meta({
		ref: 'ProcessResult',
	})

// Process response schema
export const ProcessResponseSchema = z
	.object({
		success: z.boolean(),
		message: z.string(),
		results: z.array(ProcessResultSchema),
		totalChunks: z.number(),
		processingTime: z.number(),
	})
	.describe('Process response')
	.meta({
		ref: 'ProcessResponse',
	})

// Error response schema
export const ErrorResponseSchema = z
	.object({
		error: z.string(),
		message: z.string(),
		details: z.record(z.any(), z.any()).optional(),
	})
	.describe('Error response')
	.meta({
		ref: 'ErrorResponse',
	})

// Health response schema
export const HealthResponseSchema = z
	.object({
		status: z.string(),
		timestamp: z.string(),
		services: z.object({
			vectorize: z.boolean(),
			r2: z.boolean(),
			ai: z.boolean(),
		}),
	})
	.describe('Health response')
	.meta({
		ref: 'HealthResponse',
	})

// Status response schema
export const StatusResponseSchema = z
	.object({
		status: z.string(),
		timestamp: z.string(),
		message: z.string(),
		details: z.object({
			worker: z.string(),
			version: z.string(),
			environment: z.string(),
		}),
	})
	.describe('Status response')
	.meta({
		ref: 'StatusResponse',
	})

// Status params schema
export const StatusParamsSchema = z
	.object({
		docId: z.string(),
	})
	.describe('Status params')
	.meta({
		ref: 'StatusParams',
	})

// Workflow instance schema
export const WorkflowInstanceSchema = z
	.object({
		documentId: z.string(),
		workflowInstanceId: z.string(),
		status: z.enum(['queued', 'running', 'terminated', 'errored']),
	})
	.describe('Workflow instance')
	.meta({
		ref: 'WorkflowInstance',
	})

// Workflow response schema
export const WorkflowResponseSchema = z
	.object({
		success: z.boolean(),
		message: z.string(),
		results: z.array(WorkflowInstanceSchema),
		totalWorkflows: z.number(),
	})
	.describe('Workflow response')
	.meta({
		ref: 'WorkflowResponse',
	})

// Workflow status schema
export const WorkflowStatusSchema = z
	.object({
		instanceId: z.string(),
		status: z.string(),
		output: z.any().optional(),
		error: z.any().optional(),
		timestamp: z.string(),
	})
	.describe('Workflow status')
	.meta({
		ref: 'WorkflowStatus',
	})

// Queue processing schemas
export const QueueProcessRequestSchema = z
	.object({
		documents: z.array(DocumentSchema),
		options: z
			.object({
				priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
				chunkSize: z.number().optional().default(1000),
				overlap: z.number().optional().default(200),
				dlpEnabled: z.boolean().optional().default(false),
				forceReprocess: z.boolean().optional().default(false),
				source: z.string().optional().default('api'),
			})
			.optional(),
	})
	.describe('Queue process request')
	.meta({
		ref: 'QueueProcessRequest',
	})

export const QueueProcessResponseSchema = z
	.object({
		success: z.boolean(),
		message: z.string(),
		queuedCount: z.number(),
		totalDocuments: z.number(),
		messageIds: z.array(z.string()),
		errors: z
			.array(
				z.object({
					documentId: z.string(),
					error: z.string(),
				})
			)
			.optional(),
	})
	.describe('Queue process response')
	.meta({
		ref: 'QueueProcessResponse',
	})

// Webhook schemas
export const WebhookRequestSchema = z
	.object({
		sourceType: z.enum(['sharepoint', 'confluence', 'jira', 'website']),
		eventType: z.enum(['created', 'updated', 'deleted', 'moved']),
		resourceId: z.string(),
		resourceUrl: z.string(),
		changeToken: z.string().optional(),
		metadata: z.record(z.any(), z.any()).optional(),
		options: z
			.object({
				priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('high'),
			})
			.optional(),
	})
	.describe('Webhook request')
	.meta({
		ref: 'WebhookRequest',
	})

export const WebhookResponseSchema = z
	.object({
		success: z.boolean(),
		message: z.string(),
		messageId: z.string(),
		eventType: z.string(),
		resourceId: z.string(),
	})
	.describe('Webhook response')
	.meta({
		ref: 'WebhookResponse',
	})

// Batch reprocessing schemas
export const BatchReprocessRequestSchema = z
	.object({
		documentIds: z.array(z.string()),
		reason: z.enum(['schema_change', 'model_update', 'policy_change', 'manual_reindex']),
		options: z
			.object({
				forceFullReprocess: z.boolean().optional().default(false),
				preserveVersions: z.boolean().optional().default(true),
				priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('low'),
			})
			.optional(),
	})
	.describe('Batch reprocess request')
	.meta({
		ref: 'BatchReprocessRequest',
	})

export const BatchReprocessResponseSchema = z
	.object({
		success: z.boolean(),
		message: z.string(),
		messageId: z.string(),
		documentCount: z.number(),
		reason: z.string(),
	})
	.describe('Batch reprocess response')
	.meta({
		ref: 'BatchReprocessResponse',
	})

// Workflow params schema
export const WorkflowParamsSchema = z
	.object({
		instanceId: z.string(),
	})
	.describe('Workflow params')
	.meta({
		ref: 'WorkflowParams',
	})
