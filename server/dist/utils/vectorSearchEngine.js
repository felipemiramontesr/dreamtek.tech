"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODEL_NAME = exports.DEFAULT_EMBEDDING_DIMENSIONS = void 0;
exports.parseJsonArray = parseJsonArray;
exports.extractConceptsFromText = extractConceptsFromText;
exports.cosineSimilarity = cosineSimilarity;
exports.computeTextEmbedding = computeTextEmbedding;
exports.generateAssetEmbedding = generateAssetEmbedding;
exports.searchSemantic = searchSemantic;
exports.findSimilarAssets = findSimilarAssets;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
exports.DEFAULT_EMBEDDING_DIMENSIONS = 64;
exports.DEFAULT_MODEL_NAME = 'dreamtek-multimodal-v1';
/**
 * Parses JSON strings or arrays safely.
 */
function parseJsonArray(val) {
    if (!val)
        return [];
    if (typeof val === 'string') {
        return JSON.parse(val);
    }
    return val;
}
/**
 * Extracts distinct concepts from an asset's textual representation.
 */
function extractConceptsFromText(textRepresentation) {
    if (!textRepresentation)
        return [];
    const concepts = [];
    const textParts = textRepresentation.split('. ');
    textParts.forEach((part) => {
        const colonIdx = part.indexOf(':');
        if (colonIdx !== -1) {
            const val = part.substring(colonIdx + 1).trim();
            if (val.length > 0) {
                concepts.push(val);
            }
        }
    });
    return concepts;
}
/**
 * Calculates mathematical Cosine Similarity between two vectors:
 * cos(theta) = (A . B) / (||A|| * ||B||)
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(0, Math.min(1, Math.round(similarity * 10000) / 10000));
}
/**
 * Deterministic semantic projection algorithm.
 * Converts textual and visual metadata representations into a normalized N-dimensional dense vector.
 */
function computeTextEmbedding(text, dimensions = exports.DEFAULT_EMBEDDING_DIMENSIONS) {
    const vector = new Array(dimensions).fill(0);
    if (!text || text.trim().length === 0) {
        return vector;
    }
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ');
    const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);
    if (tokens.length === 0) {
        return vector;
    }
    tokens.forEach((token, tokenIdx) => {
        const hash = crypto_1.default.createHash('sha256').update(token).digest();
        for (let i = 0; i < dimensions; i++) {
            const byteVal = hash[i % hash.length];
            const weight = 1.0 / (1.0 + tokenIdx * 0.05);
            const sign = i % 2 === 0 ? 1 : -1;
            vector[i] += Math.sin((byteVal / 255) * Math.PI * 2) * weight * sign;
        }
    });
    // Normalize L2 magnitude to 1.0
    let norm = 0;
    for (let i = 0; i < dimensions; i++) {
        norm += vector[i] * vector[i];
    }
    const sqrtNorm = Math.sqrt(norm);
    for (let i = 0; i < dimensions; i++) {
        vector[i] = Math.round((vector[i] / sqrtNorm) * 10000) / 10000;
    }
    return vector;
}
/**
 * Generates and stores a multimodal semantic embedding vector for a given asset.
 */
async function generateAssetEmbedding(tenantId, assetId, options = {}) {
    const modelName = options.model_name || exports.DEFAULT_MODEL_NAME;
    const forceRefresh = options.force_refresh ?? false;
    // 1. Fetch asset details
    const assetRows = await (0, db_1.query)(`SELECT a.id, a.tenant_id, a.title, a.mime_type, a.status, a.deleted_at,
            v.id as version_id
     FROM assets a
     JOIN asset_versions v ON v.asset_id = a.id AND v.version_number = (
       SELECT MAX(v2.version_number) FROM asset_versions v2 WHERE v2.asset_id = a.id
     )
     WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL AND a.status = 'ACTIVE'`, [assetId, tenantId]);
    if (!assetRows || assetRows.length === 0) {
        return {
            success: false,
            error: 'El activo digital no existe o no se encuentra activo.',
        };
    }
    const asset = assetRows[0];
    // 2. Check if embedding already exists and not forced
    if (!forceRefresh) {
        const existing = await (0, db_1.query)(`SELECT * FROM asset_embeddings
       WHERE tenant_id = ? AND asset_id = ? AND model_name = ?
       ORDER BY id DESC LIMIT 1`, [tenantId, assetId, modelName]);
        if (existing && existing.length > 0) {
            const row = existing[0];
            const parsedVector = parseJsonArray(row.embedding_vector);
            return {
                success: true,
                data: {
                    asset_id: assetId,
                    version_id: row.version_id,
                    model_name: row.model_name,
                    dimensions: row.dimensions,
                    embedding_vector: parsedVector,
                    text_representation: row.text_representation || '',
                },
            };
        }
    }
    // 3. Fetch tags
    const tagRows = await (0, db_1.query)(`SELECT t.name FROM tags t
     JOIN asset_tags at ON at.tag_id = t.id
     WHERE at.asset_id = ? AND t.tenant_id = ?`, [assetId, tenantId]);
    const tagsList = (tagRows || []).map((t) => t.name);
    // 4. Fetch AI visual metadata if available
    const aiRows = await (0, db_1.query)(`SELECT labels, dominant_colors, detected_objects FROM asset_ai_metadata
     WHERE tenant_id = ? AND asset_id = ? AND status = 'COMPLETED'
     ORDER BY id DESC LIMIT 1`, [tenantId, assetId]);
    const aiLabels = [];
    const aiColors = [];
    if (aiRows && aiRows.length > 0) {
        const aiRow = aiRows[0];
        const parsedLabels = parseJsonArray(aiRow.labels);
        parsedLabels.forEach((l) => {
            if (l.label)
                aiLabels.push(l.label);
        });
        const parsedColors = parseJsonArray(aiRow.dominant_colors);
        parsedColors.forEach((c) => {
            if (c.name)
                aiColors.push(c.name);
        });
    }
    // 5. Compose textual representation
    const textRepresentation = [
        `Title: ${asset.title}`,
        `Type: ${asset.mime_type}`,
        tagsList.length > 0 ? `Tags: ${tagsList.join(', ')}` : '',
        aiLabels.length > 0 ? `Visuals: ${aiLabels.join(', ')}` : '',
        aiColors.length > 0 ? `Colors: ${aiColors.join(', ')}` : '',
    ]
        .filter(Boolean)
        .join('. ');
    // 6. Compute embedding vector
    const embeddingVector = computeTextEmbedding(textRepresentation, exports.DEFAULT_EMBEDDING_DIMENSIONS);
    // 7. Upsert embedding record
    await (0, db_1.query)(`INSERT INTO asset_embeddings
      (tenant_id, asset_id, version_id, model_name, dimensions, embedding_vector, text_representation)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        tenantId,
        assetId,
        asset.version_id,
        modelName,
        exports.DEFAULT_EMBEDDING_DIMENSIONS,
        JSON.stringify(embeddingVector),
        textRepresentation,
    ]);
    return {
        success: true,
        data: {
            asset_id: assetId,
            version_id: asset.version_id,
            model_name: modelName,
            dimensions: exports.DEFAULT_EMBEDDING_DIMENSIONS,
            embedding_vector: embeddingVector,
            text_representation: textRepresentation,
        },
    };
}
/**
 * Searches for assets matching a natural language semantic query using cosine similarity over embeddings.
 */
async function searchSemantic(tenantId, queryText, options = {}) {
    const minScore = options.min_score ?? 0.55;
    const limit = options.limit ?? 10;
    const queryVector = computeTextEmbedding(queryText, exports.DEFAULT_EMBEDDING_DIMENSIONS);
    // Fetch all active embeddings for the tenant
    const rows = await (0, db_1.query)(`SELECT e.asset_id, e.embedding_vector, e.text_representation,
            a.title, a.mime_type, v.byte_size
     FROM asset_embeddings e
     JOIN assets a ON a.id = e.asset_id
     JOIN asset_versions v ON v.asset_id = a.id AND v.id = e.version_id
     WHERE e.tenant_id = ? AND a.deleted_at IS NULL AND a.status = 'ACTIVE'`, [tenantId]);
    const scoredResults = [];
    for (const row of rows || []) {
        const vec = parseJsonArray(row.embedding_vector);
        const score = cosineSimilarity(queryVector, vec);
        if (score >= minScore) {
            const concepts = extractConceptsFromText(row.text_representation);
            scoredResults.push({
                asset_id: row.asset_id,
                title: row.title,
                mime_type: row.mime_type,
                byte_size: Number(row.byte_size),
                similarity_score: score,
                matched_concepts: concepts,
                thumbnail_url: `/api/v1/assets/${row.asset_id}/thumbnail`,
            });
        }
    }
    // Sort descending by score
    scoredResults.sort((a, b) => b.similarity_score - a.similarity_score);
    const sliced = scoredResults.slice(0, limit);
    return {
        query: queryText,
        total_matches: scoredResults.length,
        results: sliced,
    };
}
/**
 * Finds assets similar to a given asset based on cosine similarity of their embedding vectors.
 */
async function findSimilarAssets(tenantId, assetId, options = {}) {
    const minScore = options.min_score ?? 0.55;
    const limit = options.limit ?? 10;
    // 1. Get or generate embedding for target asset
    const targetEmbeddingResult = await generateAssetEmbedding(tenantId, assetId);
    if (!targetEmbeddingResult.success) {
        return {
            success: false,
            error: targetEmbeddingResult.error,
        };
    }
    const targetVector = targetEmbeddingResult.data.embedding_vector;
    // 2. Query other embeddings in the same tenant
    const rows = await (0, db_1.query)(`SELECT e.asset_id, e.embedding_vector, e.text_representation,
            a.title, a.mime_type, v.byte_size
     FROM asset_embeddings e
     JOIN assets a ON a.id = e.asset_id
     JOIN asset_versions v ON v.asset_id = a.id AND v.id = e.version_id
     WHERE e.tenant_id = ? AND e.asset_id != ? AND a.deleted_at IS NULL AND a.status = 'ACTIVE'`, [tenantId, assetId]);
    const scoredResults = [];
    for (const row of rows || []) {
        const vec = parseJsonArray(row.embedding_vector);
        const score = cosineSimilarity(targetVector, vec);
        if (score >= minScore) {
            const concepts = extractConceptsFromText(row.text_representation);
            scoredResults.push({
                asset_id: row.asset_id,
                title: row.title,
                mime_type: row.mime_type,
                byte_size: Number(row.byte_size),
                similarity_score: score,
                matched_concepts: concepts,
                thumbnail_url: `/api/v1/assets/${row.asset_id}/thumbnail`,
            });
        }
    }
    scoredResults.sort((a, b) => b.similarity_score - a.similarity_score);
    const sliced = scoredResults.slice(0, limit);
    return {
        success: true,
        total_matches: scoredResults.length,
        results: sliced,
    };
}
