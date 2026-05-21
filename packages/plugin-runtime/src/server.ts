import { createServerPluginRegistry } from "./index";
import { generatedBuiltinServerPlugins } from "./builtins.server.generated";
export {
  isRequiredBuiltinPluginId,
  requiredBuiltinPluginIds,
} from "./constants";

export const builtinServerPlugins = generatedBuiltinServerPlugins;
export const builtinServerPluginRegistry =
  createServerPluginRegistry<any>(builtinServerPlugins);
