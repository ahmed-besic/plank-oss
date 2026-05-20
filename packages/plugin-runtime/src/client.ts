import { createClientPluginRegistry } from "./index";
import { generatedBuiltinClientPlugins } from "./builtins.client.generated";
export {
  isRequiredBuiltinPluginId,
  requiredBuiltinPluginIds,
} from "./constants";

export const builtinClientPlugins = generatedBuiltinClientPlugins;
export const builtinClientPluginRegistry =
  createClientPluginRegistry(builtinClientPlugins);
