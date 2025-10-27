import { HumanFormNode, JsonObject, Task } from '../../types';
import { EngineStorage } from '../storage';

interface CreateHumanTaskOptions {
  storage: EngineStorage;
  instanceId: string;
  node: HumanFormNode;
  context: JsonObject;
}

export async function createHumanTask({
  storage,
  instanceId,
  node,
  context
}: CreateHumanTaskOptions): Promise<Task> {
  return storage.createTask({
    workflowInstanceId: instanceId,
    nodeId: node.id,
    formSchemaRef: node.formSchemaRef,
    status: 'OPEN',
    assignees: node.assignees,
    context
  });
}
