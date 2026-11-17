/* @generated from schemas/v19-public-vocabulary.graphql by Wesley. Do not edit. */

export const V19_MCP_CAPABILITIES = [
  {
    "name": "warp_observation_start",
    "description": "Start one bounded Observation and retain its Readings for transport.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "lane": {
          "type": "string",
          "minLength": 1
        },
        "observerId": {
          "type": "string",
          "minLength": 1
        },
        "reading": {
          "type": "object"
        }
      },
      "required": [
        "lane",
        "observerId",
        "reading"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "warp_observation_read",
    "description": "Read the next bounded transport batch from an Observation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "observationId": {
          "type": "string",
          "minLength": 1
        },
        "cursor": {
          "type": "string",
          "minLength": 1
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 256
        }
      },
      "required": [
        "observationId"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "warp_observation_cancel",
    "description": "Cancel and discard one retained Observation transport.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "observationId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "observationId"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "warp_receipt_get",
    "description": "Return one canonical Receipt retained by this MCP server.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "receiptRef": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "receiptRef"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "warp_doctor",
    "description": "Diagnose one local Runtime Lane.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "lane": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "lane"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "warp_repair",
    "description": "Apply one explicit local Runtime repair.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "lane": {
          "type": "string",
          "minLength": 1
        },
        "action": {
          "type": "string",
          "enum": [
            "materialization"
          ]
        }
      },
      "required": [
        "lane",
        "action"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "warp_audit",
    "description": "Verify the local Runtime audit trail.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "lane": {
          "type": "string",
          "minLength": 1
        },
        "writer": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "lane"
      ],
      "additionalProperties": false
    }
  }
] as const;
