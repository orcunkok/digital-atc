import Ajv from 'ajv';
import systemPrompt from '../../prompts/system_pilot.txt?raw';
import developerPromptTemplate from '../../prompts/developer_pilot.txt?raw';
import validationPromptTemplate from '../../prompts/promt_validation.md?raw';
import responseSchema from '../../schemas/response.schema.json';
import requestSchema from '../../schemas/request.schema.json';
import { callOpenRouter, OpenRouterClientError } from './openrouterClient';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false, // Skip meta-schema validation to avoid $schema resolution issues
});

// Create copies of schemas without $schema to avoid meta-schema resolution issues
const responseSchemaForValidation = { ...responseSchema };
delete responseSchemaForValidation.$schema;

const requestSchemaForValidation = { ...requestSchema };
delete requestSchemaForValidation.$schema;

const validatePilotResponse = ajv.compile(responseSchemaForValidation);
const validatePilotRequest = ajv.compile(requestSchemaForValidation);
const responseSchemaString = JSON.stringify(responseSchema, null, 2);
const validationPrompt = validationPromptTemplate.trim();

export class PilotAgentError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'PilotAgentError';
    this.code = options.code || 'pilot_agent_error';
    this.details = options.details;
    this.cause = options.cause;
  }
}

function replaceAll(template, token, value) {
  return template.split(token).join(value ?? '');
}

function escapeDoubleQuotes(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/"/g, '\\"');
}

function formatTraffic(traffic) {
  if (!traffic || traffic.length === 0) {
    return 'None';
  }
  return traffic
    .map(
      (t) =>
        `ID ${t.id}: lat ${t.lat.toFixed(4)}, lon ${t.lon.toFixed(4)}, altitude ${t.altitudeFt} ft, heading ${t.headingDeg}°, speed ${t.groundspeedKt} kt`
    )
    .join('; ');
}

function buildDeveloperPrompt(request) {
  let prompt = developerPromptTemplate;
  prompt = replaceAll(prompt, '{{CONTENTS_OF../schemas/response.schema.json}}', responseSchemaString);
  prompt = replaceAll(prompt, '{callsign}', request.callsign);
  prompt = replaceAll(prompt, '{phase}', request.phase);
  prompt = replaceAll(prompt, '{lat}', String(request.state.lat));
  prompt = replaceAll(prompt, '{lon}', String(request.state.lon));
  prompt = replaceAll(prompt, '{altitudeFt}', String(request.state.altitudeFt));
  prompt = replaceAll(prompt, '{headingDeg}', String(request.state.headingDeg));
  prompt = replaceAll(prompt, '{groundspeedKt}', String(request.state.groundspeedKt));
  prompt = replaceAll(prompt, '{vsFpm}', String(request.state.vsFpm));
  prompt = replaceAll(prompt, '{traffic}', formatTraffic(request.traffic));
  prompt = replaceAll(prompt, '{atcText}', escapeDoubleQuotes(request.atcText));
  return prompt.trim();
}

function extractJsonBlock(text) {
  if (!text) return text;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function formatAjvErrors(errors = []) {
  if (!errors.length) return '- Validator returned no additional details.';
  return errors
    .slice(0, 8)
    .map((err) => {
      const path = err.instancePath || err.schemaPath || '(root)';
      const msg = err.message || 'validation error';
      return `- ${path}: ${msg}`;
    })
    .join('\n');
}

function buildRetryPrompt(errorSummary) {
  return [
    'Your previous JSON response failed validation.',
    'Fix the issues listed below and reply with corrected JSON only.',
    '',
    'Validator output:',
    errorSummary,
    '',
    validationPrompt,
  ].join('\n');
}

export async function runPilotAgent(requestPayload) {
  if (!validatePilotRequest(requestPayload)) {
    throw new PilotAgentError('Pilot agent request payload failed validation.', {
      code: 'invalid_request',
      details: validatePilotRequest.errors,
    });
  }

  const messages = [
    { role: 'system', content: systemPrompt.trim() },
    { role: 'user', content: buildDeveloperPrompt(requestPayload) },
  ];

  let lastRawResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { content, usage } = await callOpenRouter({ messages });
      lastRawResponse = content;

      const jsonCandidate = extractJsonBlock(content);
      let parsed;
      try {
        parsed = JSON.parse(jsonCandidate);
      } catch (parseError) {
        lastError = new PilotAgentError('OpenAI response was not valid JSON.', {
          code: 'json_parse_error',
          details: parseError.message,
          cause: parseError,
        });
        if (attempt === 0) {
          messages.push({ role: 'assistant', content });
          messages.push({ role: 'user', content: buildRetryPrompt(`- JSON parse error: ${parseError.message}`) });
          continue;
        }
        throw lastError;
      }

      if (!validatePilotResponse(parsed)) {
        const ajvSummary = formatAjvErrors(validatePilotResponse.errors);
        lastError = new PilotAgentError('OpenAI response failed schema validation.', {
          code: 'schema_validation_error',
          details: validatePilotResponse.errors,
        });

        if (attempt === 0) {
          messages.push({ role: 'assistant', content });
          messages.push({ role: 'user', content: buildRetryPrompt(ajvSummary) });
          continue;
        }

        throw lastError;
      }

      return {
        result: parsed,
        usage,
        attempts: attempt + 1,
        messages,
      };
    } catch (error) {
      if (error instanceof OpenRouterClientError) {
        lastError = new PilotAgentError(error.message, {
          code: error.code,
          details: error.details,
          cause: error,
        });
        break;
      }

      if (error instanceof PilotAgentError) {
        lastError = error;
        break;
      }

      lastError = new PilotAgentError(error.message || 'Unknown pilot agent failure.', {
        code: error.code,
        cause: error,
      });
      break;
    }
  }

  throw lastError || new PilotAgentError('Pilot agent failed with an unknown error.');
}

