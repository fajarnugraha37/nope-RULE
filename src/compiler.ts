import { RuleSet, FlowDefinition, FlowEdge, FlowNode, DecisionTable } from './types';

export interface CompiledFlow {
  definition: FlowDefinition;
  nodesById: Map<string, FlowNode>;
  adjacency: Map<string, FlowEdge[]>;
}

export interface CompiledRuleSet {
  ruleSet: RuleSet;
  flows: Map<string, CompiledFlow>;
  tables: Map<string, DecisionTable>;
}

export function compileRuleSet(ruleSet: RuleSet): CompiledRuleSet {
  const flows = new Map<string, CompiledFlow>();
  const tables = new Map<string, DecisionTable>();

  if (ruleSet.tables) {
    for (const [name, table] of Object.entries(ruleSet.tables)) {
      tables.set(name, table);
    }
  }

  for (const [name, flow] of Object.entries(ruleSet.flows)) {
    flows.set(name, compileFlow(flow));
  }

  return { ruleSet, flows, tables };
}

function compileFlow(flow: FlowDefinition): CompiledFlow {
  const nodesById = new Map<string, FlowNode>();
  for (const node of flow.nodes) {
    if (nodesById.has(node.id)) {
      throw new Error(`Duplicate node id '${node.id}' in flow '${flow.name}'`);
    }
    nodesById.set(node.id, node);
  }

  if (!nodesById.has(flow.entry)) {
    throw new Error(`Flow '${flow.name}' refers to missing entry node '${flow.entry}'`);
  }

  const adjacency = new Map<string, FlowEdge[]>();
  for (const edge of flow.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
      throw new Error(
        `Invalid edge in flow '${flow.name}': '${edge.from}' -> '${edge.to}' references unknown node`
      );
    }
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)!.push(edge);
  }

  return {
    definition: flow,
    nodesById,
    adjacency
  };
}
