import { vmPool } from "./infra/vm-pool";
import { brokerFunctionUrl } from "./infra/broker";

export const brokerUrl = brokerFunctionUrl.functionUrl;
export const poolName = vmPool.name;
