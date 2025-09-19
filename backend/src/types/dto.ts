// src/types/dto.ts
import { z } from "zod";

/** Shared enums (keep in sync with DB enums) */
export const RoleEnum = z.enum(["Analyst", "Operator", "Admin"]);
export type Role = z.infer<typeof RoleEnum>;

export const PlatformEnum = z.enum(["win", "lin", "osx", "net"]);
export type Platform = z.infer<typeof PlatformEnum>;

export const AgentTypeEnum = z.enum(["trigger", "beacon", "trigger_beacon"]);
export type AgentType = z.infer<typeof AgentTypeEnum>;

/** Utility */
export const Uuid = z.string().uuid();
export const UuidArray = z.array(Uuid).min(1).max(1000);
export const IsoDate = z.string().datetime({ offset: true }); // e.g. 2025-01-01T00:00:00Z

/** ---------------- Users (Admin) ---------------- */
export const CreateUserDto = z.object({
  username: z.string().min(3).max(128),
  // password hashing should be handled outside the API; store hash only
  password_hash: z.string().min(32).max(512),
  roles: z.array(RoleEnum).optional()
});
export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const UpdateUserDto = z.object({
  username: z.string().min(3).max(128).optional(),
  account_status: z.enum(["enabled", "disabled"]).optional(),
  roles: z.array(RoleEnum).optional()
});
export type UpdateUserDto = z.infer<typeof UpdateUserDto>;

/** ---------------- Engagements ---------------- */
export const CreateEngagementDto = z.object({
  engagement_name: z.string().min(1).max(256),
  start_ts: IsoDate,
  end_ts: IsoDate.optional()
});
export type CreateEngagementDto = z.infer<typeof CreateEngagementDto>;

export const UpdateEngagementDto = z.object({
  engagement_name: z.string().min(1).max(256).optional(),
  start_ts: IsoDate.optional(),
  end_ts: IsoDate.optional()
});
export type UpdateEngagementDto = z.infer<typeof UpdateEngagementDto>;

export const AddEngagementUsersDto = z.object({
  user_uuids: UuidArray
});
export type AddEngagementUsersDto = z.infer<typeof AddEngagementUsersDto>;

/** ---------------- Tasking catalog ---------------- */
export const CreateTaskDto = z.object({
  task_long_name: z.string().min(1).max(256),
  task_permission: RoleEnum
});
export type CreateTaskDto = z.infer<typeof CreateTaskDto>;

export const UpdateTaskDto = z.object({
  task_long_name: z.string().min(1).max(256).optional(),
  task_permission: RoleEnum.optional()
});
export type UpdateTaskDto = z.infer<typeof UpdateTaskDto>;

/** ---------------- Agent configuration ---------------- */
export const CreateAgentConfigDto = z.object({
  build_uuid: Uuid,
  build_configuration: z.record(z.any()), // JSONB
  platform: PlatformEnum,
  type: AgentTypeEnum,
  self_uninstall_sec: z.number().int().nonnegative().optional(),
  checkin_interval_sec: z.number().int().positive().optional(),
  load_balancers_uuid: Uuid.optional()
}).refine(
  (v) => (v.type === "trigger" ? v.checkin_interval_sec === undefined : !!v.checkin_interval_sec),
  { message: "checkin_interval_sec is required for beacon/trigger_beacon and must be absent for trigger" }
);
export type CreateAgentConfigDto = z.infer<typeof CreateAgentConfigDto>;

export const UpdateAgentConfigDto = z.object({
  build_configuration: z.record(z.any()).optional(),
  self_uninstall_sec: z.number().int().nonnegative().optional(),
  checkin_interval_sec: z.number().int().positive().optional(),
  load_balancers_uuid: Uuid.optional()
});
export type UpdateAgentConfigDto = z.infer<typeof UpdateAgentConfigDto>;

export const ReplaceSupportedTasksDto = z.object({
  task_uuids: z.array(Uuid).default([])
});
export type ReplaceSupportedTasksDto = z.infer<typeof ReplaceSupportedTasksDto>;

export const ReplaceConfiguredTasksDto = z.object({
  task_uuids: z.array(Uuid).default([])
});
export type ReplaceConfiguredTasksDto = z.infer<typeof ReplaceConfiguredTasksDto>;

/** ---------------- Agents (enroll + tasks) ---------------- */
export const EnrollAgentDto = z.object({
  agent_uuid: Uuid,
  agent_configuration_uuid: Uuid
});
export type EnrollAgentDto = z.infer<typeof EnrollAgentDto>;

export const IssueAgentTaskDto = z.object({
  task_uuid: Uuid.optional(),
  task_name: z.string().min(1).max(256).optional(),
  parameters: z.record(z.any()).optional()
}).refine((v) => !!v.task_uuid || !!v.task_name, { message: "task_uuid or task_name is required" });
export type IssueAgentTaskDto = z.infer<typeof IssueAgentTaskDto>;

/** ---------------- Load balancers ---------------- */
export const CreateLoadBalancerDto = z.object({
  engagement_uuid: Uuid.optional(),
  first_hop: z.string().optional(),
  second_hop: z.string().optional(),
  third_hop: z.string().optional(),
  last_hop: z.string().optional()
}).refine(
  (v) => !!(v.first_hop || v.second_hop || v.third_hop || v.last_hop),
  { message: "At least one hop must be provided" }
);
export type CreateLoadBalancerDto = z.infer<typeof CreateLoadBalancerDto>;

export const UpdateLoadBalancerDto = z.object({
  engagement_uuid: Uuid.optional(),
  first_hop: z.string().optional(),
  second_hop: z.string().optional(),
  third_hop: z.string().optional(),
  last_hop: z.string().optional()
});
export type UpdateLoadBalancerDto = z.infer<typeof UpdateLoadBalancerDto>;

/** ---------------- Endpoints & inventory ---------------- */
export const CreateEndpointDto = z.object({
  engagement_uuid: Uuid,
  agent_uuid: Uuid.optional(),
  os_version: z.string().optional(),
  ip: z.array(z.string()).optional(),       // inet[]
  system_info: z.record(z.any()).optional(),
  gateway: z.array(z.string()).optional(),  // inet[]
  routing_table: z.record(z.any()).optional(),
  arp: z.record(z.any()).optional(),
  installed_applications: z.record(z.any()).optional(),
  drivers: z.record(z.any()).optional(),
  patch_history: z.record(z.any()).optional()
});
export type CreateEndpointDto = z.infer<typeof CreateEndpointDto>;

export const UpdateEndpointDto = CreateEndpointDto.partial();
export type UpdateEndpointDto = z.infer<typeof UpdateEndpointDto>;

export const UpsertInventoryDto = z.object({
  system_info: z.record(z.any()).optional(),
  drivers: z.record(z.any()).optional(),
  installed_applications: z.record(z.any()).optional(),
  patch_history: z.record(z.any()).optional(),
  routing_table: z.record(z.any()).optional(),
  arp: z.record(z.any()).optional()
});
export type UpsertInventoryDto = z.infer<typeof UpsertInventoryDto>;

/** ---------------- Dirwalks ---------------- */
export const CreateDirwalkDto = z.object({
  engagement_uuid: Uuid,
  agent_uuid: Uuid,
  payload: z.record(z.any()) // large JSON blob
});
export type CreateDirwalkDto = z.infer<typeof CreateDirwalkDto>;
