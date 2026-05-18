/**
 * graph.mjs — Graph definition primitives for LangGraph-style orchestration
 *
 * Core classes:
 * - GraphNode: A single node in the graph (task, worker, parallel, human, etc.)
 * - GraphEdge: A directed edge between nodes (with optional condition)
 * - Graph: Complete graph definition with validation and serialization
 */

import { randomUUID } from 'crypto';

/**
 * Valid node types
 */
const NODE_TYPES = ['task', 'worker', 'parallel', 'human', 'merge', 'conditional', 'passthrough'];

/**
 * GraphNode represents a single executable unit in the graph
 */
export class GraphNode {
  constructor(id, type, config = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Node id must be a non-empty string');
    }
    if (!NODE_TYPES.includes(type)) {
      throw new Error(`Invalid node type: ${type}. Must be one of: ${NODE_TYPES.join(', ')}`);
    }

    this.id = id;
    this.type = type;
    this.config = config;

    // Type-specific validation
    if (type === 'task' && !config.agentId) {
      throw new Error('task nodes require config.agentId');
    }
    if (type === 'worker' && !config.botId) {
      throw new Error('worker nodes require config.botId');
    }
    if (type === 'parallel' && !Array.isArray(config.branches)) {
      throw new Error('parallel nodes require config.branches array');
    }
    if (type === 'merge' && !config.strategy) {
      throw new Error('merge nodes require config.strategy (all|first|custom)');
    }
    if (type === 'conditional' && !config.condition) {
      throw new Error('conditional nodes require config.condition (function or string)');
    }
    if (type === 'human' && !config.prompt) {
      throw new Error('human nodes require config.prompt');
    }
  }

  /**
   * Serialize node to JSON (with function serialization)
   */
  toJSON() {
    const config = { ...this.config };

    // Serialize functions to strings
    if (this.type === 'conditional' && typeof config.condition === 'function') {
      config.condition = config.condition.toString();
      config._conditionIsSerialized = true;
    }
    if (this.type === 'merge' && typeof config.strategy === 'function') {
      config.strategy = config.strategy.toString();
      config._strategyIsSerialized = true;
    }

    return {
      id: this.id,
      type: this.type,
      config
    };
  }

  /**
   * Deserialize node from JSON
   */
  static fromJSON(data) {
    const config = { ...data.config };

    // Deserialize functions from strings
    if (data.type === 'conditional' && config._conditionIsSerialized) {
      try {
        config.condition = eval(`(${config.condition})`);
      } catch (err) {
        throw new Error(`Failed to deserialize condition function: ${err.message}`);
      }
      delete config._conditionIsSerialized;
    }
    if (data.type === 'merge' && config._strategyIsSerialized) {
      try {
        config.strategy = eval(`(${config.strategy})`);
      } catch (err) {
        throw new Error(`Failed to deserialize strategy function: ${err.message}`);
      }
      delete config._strategyIsSerialized;
    }

    return new GraphNode(data.id, data.type, config);
  }
}

/**
 * GraphEdge represents a directed connection between two nodes
 */
export class GraphEdge {
  constructor(from, to, condition = null) {
    if (!from || typeof from !== 'string') {
      throw new Error('Edge from must be a non-empty string (node id)');
    }
    if (!to || typeof to !== 'string') {
      throw new Error('Edge to must be a non-empty string (node id)');
    }

    this.from = from;
    this.to = to;
    this.condition = condition;
  }

  /**
   * Serialize edge to JSON (with function serialization)
   */
  toJSON() {
    const result = {
      from: this.from,
      to: this.to
    };

    if (this.condition) {
      if (typeof this.condition === 'function') {
        result.condition = this.condition.toString();
        result._conditionIsSerialized = true;
      } else {
        result.condition = this.condition;
      }
    }

    return result;
  }

  /**
   * Deserialize edge from JSON
   */
  static fromJSON(data) {
    let condition = data.condition;

    if (condition && data._conditionIsSerialized) {
      try {
        condition = eval(`(${condition})`);
      } catch (err) {
        throw new Error(`Failed to deserialize edge condition: ${err.message}`);
      }
    }

    return new GraphEdge(data.from, data.to, condition);
  }
}

/**
 * Graph represents a complete workflow definition
 */
export class Graph {
  constructor(name, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Graph name must be a non-empty string');
    }

    this.id = options.id || `graph-${randomUUID()}`;
    this.name = name;
    this.version = options.version || 1;
    this.nodes = new Map();
    this.edges = [];
    this.entryNode = options.entryNode || null;
    this.metadata = options.metadata || {};
  }

  /**
   * Add a node to the graph
   */
  addNode(node) {
    if (!(node instanceof GraphNode)) {
      throw new Error('Must add a GraphNode instance');
    }
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id ${node.id} already exists`);
    }
    this.nodes.set(node.id, node);
    return this;
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edge) {
    if (!(edge instanceof GraphEdge)) {
      throw new Error('Must add a GraphEdge instance');
    }
    this.edges.push(edge);
    return this;
  }

  /**
   * Set the entry node for execution
   */
  setEntryNode(nodeId) {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Entry node ${nodeId} does not exist in graph`);
    }
    this.entryNode = nodeId;
    return this;
  }

  /**
   * Validate graph structure
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check entry node
    if (!this.entryNode) {
      errors.push('Graph has no entry node');
    } else if (!this.nodes.has(this.entryNode)) {
      errors.push(`Entry node ${this.entryNode} does not exist`);
    }

    // Check edge references
    for (const edge of this.edges) {
      if (!this.nodes.has(edge.from)) {
        errors.push(`Edge references non-existent from node: ${edge.from}`);
      }
      if (!this.nodes.has(edge.to)) {
        errors.push(`Edge references non-existent to node: ${edge.to}`);
      }
    }

    // Check for unreachable nodes (warning only)
    if (this.entryNode && errors.length === 0) {
      const reachable = new Set();
      const queue = [this.entryNode];

      while (queue.length > 0) {
        const nodeId = queue.shift();
        if (reachable.has(nodeId)) continue;
        reachable.add(nodeId);

        // Find outgoing edges
        for (const edge of this.edges) {
          if (edge.from === nodeId && !reachable.has(edge.to)) {
            queue.push(edge.to);
          }
        }

        // For parallel nodes, add branches
        const node = this.nodes.get(nodeId);
        if (node.type === 'parallel' && node.config.branches) {
          for (const branchNodeId of node.config.branches) {
            if (!reachable.has(branchNodeId)) {
              queue.push(branchNodeId);
            }
          }
        }
      }

      for (const nodeId of this.nodes.keys()) {
        if (!reachable.has(nodeId)) {
          warnings.push(`Node ${nodeId} is unreachable from entry node`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Serialize graph to JSON for DB storage
   */
  serialize() {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Cannot serialize invalid graph: ${validation.errors.join(', ')}`);
    }

    return JSON.stringify({
      id: this.id,
      name: this.name,
      version: this.version,
      entryNode: this.entryNode,
      nodes: Array.from(this.nodes.values()).map(n => n.toJSON()),
      edges: this.edges.map(e => e.toJSON()),
      metadata: this.metadata
    });
  }

  /**
   * Deserialize graph from JSON
   */
  static deserialize(jsonString) {
    const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

    const graph = new Graph(data.name || data.id || 'unnamed-graph', {
      id: data.id,
      version: data.version,
      entryNode: data.entryNode,
      metadata: data.metadata
    });

    // Restore nodes
    for (const nodeData of data.nodes) {
      graph.addNode(GraphNode.fromJSON(nodeData));
    }

    // Restore edges
    for (const edgeData of data.edges) {
      graph.addEdge(GraphEdge.fromJSON(edgeData));
    }

    return graph;
  }
}
