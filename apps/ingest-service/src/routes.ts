import { describeRoute, resolver } from 'hono-openapi'

import {
	BatchReprocessRequestSchema,
	BatchReprocessResponseSchema,
	ErrorResponseSchema,
	HealthResponseSchema,
	ProcessDocumentSchema,
	ProcessResponseSchema,
	QueueProcessRequestSchema,
	QueueProcessResponseSchema,
	StatusParamsSchema,
	StatusResponseSchema,
	WebhookRequestSchema,
	WebhookResponseSchema,
	WorkflowParamsSchema,
	WorkflowResponseSchema,
	WorkflowStatusSchema,
} from './schemas'

// Health check route configuration
export const healthRouteConfig = describeRoute({
	tags: ['Health'],
	summary: 'Health check',
	description: 'Check if the service is healthy',
	responses: {
		200: {
			description: 'Service is healthy',
			content: {
				'application/json': {
					schema: resolver(HealthResponseSchema),
				},
			},
		},
	},
})

// Process documents route configuration
export const processRouteConfig = describeRoute({
	tags: ['Documents'],
	summary: 'Process documents',
	description: 'Process documents through the RAG pipeline',
	requestBody: {
		description: 'Documents to process',
		content: {
			'application/json': {
				schema: resolver(ProcessDocumentSchema),
			},
		},
		required: true,
	},
	responses: {
		200: {
			description: 'Documents processed successfully',
			content: {
				'application/json': {
					schema: resolver(ProcessResponseSchema),
				},
			},
		},
		500: {
			description: 'Document processing failed',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Document status route configuration
export const statusRouteConfig = describeRoute({
	tags: ['Documents'],
	summary: 'Check document status',
	description: 'Check if a document exists and get its metadata',
	parameters: [
		{
			name: 'docId',
			in: 'path',
			required: true,
			schema: {
				type: 'string',
			},
			description: 'Document ID to check',
		},
	],
	responses: {
		200: {
			description: 'Document status retrieved',
			content: {
				'application/json': {
					schema: resolver(StatusResponseSchema),
				},
			},
		},
		404: {
			description: 'Document not found',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
		500: {
			description: 'Status check failed',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Process documents via workflow route configuration
export const processWorkflowRouteConfig = describeRoute({
	tags: ['Workflows'],
	summary: 'Process documents via workflow',
	description: 'Process documents through the RAG pipeline using Cloudflare Workflows',
	requestBody: {
		description: 'Documents to process',
		content: {
			'application/json': {
				schema: resolver(ProcessDocumentSchema),
			},
		},
		required: true,
	},
	responses: {
		202: {
			description: 'Workflows queued for processing',
			content: {
				'application/json': {
					schema: resolver(WorkflowResponseSchema),
				},
			},
		},
		500: {
			description: 'Workflow creation failed',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Workflow status route configuration
export const workflowStatusRouteConfig = describeRoute({
	tags: ['Workflows'],
	summary: 'Get workflow status',
	description: 'Get the status of a workflow instance',
	parameters: [
		{
			name: 'instanceId',
			in: 'path',
			required: true,
			schema: {
				type: 'string',
			},
			description: 'Workflow instance ID',
		},
	],
	responses: {
		200: {
			description: 'Workflow status retrieved',
			content: {
				'application/json': {
					schema: resolver(WorkflowStatusSchema),
				},
			},
		},
		404: {
			description: 'Workflow instance not found',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
		500: {
			description: 'Failed to get workflow status',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Queue-based processing route configuration
export const queueProcessRouteConfig = describeRoute({
	tags: ['Queue Processing'],
	summary: 'Queue documents for processing',
	description: 'Queue documents for asynchronous processing through the RAG pipeline',
	requestBody: {
		description: 'Documents to queue for processing',
		content: {
			'application/json': {
				schema: resolver(QueueProcessRequestSchema),
			},
		},
		required: true,
	},
	responses: {
		202: {
			description: 'Documents queued successfully',
			content: {
				'application/json': {
					schema: resolver(QueueProcessResponseSchema),
				},
			},
		},
		400: {
			description: 'Bad request',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
		500: {
			description: 'Internal server error',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Webhook processing route configuration
export const webhookRouteConfig = describeRoute({
	tags: ['Webhooks'],
	summary: 'Handle webhook events',
	description: 'Process webhook events from external systems (SharePoint, Confluence, etc.)',
	requestBody: {
		description: 'Webhook event data',
		content: {
			'application/json': {
				schema: resolver(WebhookRequestSchema),
			},
		},
		required: true,
	},
	responses: {
		202: {
			description: 'Webhook event queued successfully',
			content: {
				'application/json': {
					schema: resolver(WebhookResponseSchema),
				},
			},
		},
		400: {
			description: 'Bad request',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
		500: {
			description: 'Internal server error',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Batch reprocessing route configuration
export const batchReprocessRouteConfig = describeRoute({
	tags: ['Batch Operations'],
	summary: 'Queue batch reprocessing',
	description: 'Queue multiple documents for batch reprocessing',
	requestBody: {
		description: 'Batch reprocessing request',
		content: {
			'application/json': {
				schema: resolver(BatchReprocessRequestSchema),
			},
		},
		required: true,
	},
	responses: {
		202: {
			description: 'Batch reprocessing queued successfully',
			content: {
				'application/json': {
					schema: resolver(BatchReprocessResponseSchema),
				},
			},
		},
		400: {
			description: 'Bad request',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
		500: {
			description: 'Internal server error',
			content: {
				'application/json': {
					schema: resolver(ErrorResponseSchema),
				},
			},
		},
	},
})

// Export validation schemas for reuse
export { ProcessDocumentSchema, StatusParamsSchema, WorkflowParamsSchema }
