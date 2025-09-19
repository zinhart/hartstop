// src/db/sql.ts (parameterized query snippets)
export const SQL = {
  // Users (admin)
  insertUser: `
    INSERT INTO users (username, password_hash, account_status)
    VALUES ($1, $2, 'enabled')
    RETURNING user_uuid, username, account_status, created_at;
  `,
  disableUser: `UPDATE users SET account_status='disabled' WHERE user_uuid=$1 RETURNING user_uuid;`,
  enableUser:  `UPDATE users SET account_status='enabled'  WHERE user_uuid=$1 RETURNING user_uuid;`,
  deleteUser:  `DELETE FROM users WHERE user_uuid=$1 RETURNING user_uuid;`,

  // Agent enroll
  insertAgentCore: `
    INSERT INTO agent_core (agent_uuid, agent_configuration_uuid)
    VALUES ($1, $2)
    ON CONFLICT (agent_uuid) DO NOTHING
    RETURNING agent_uuid, agent_configuration_uuid, created_at;
  `,

  // Check-in
  insertCheckIn: `
    INSERT INTO agent_check_ins (agent_uuid) VALUES ($1);
    UPDATE agent_core SET last_seen = now() WHERE agent_uuid=$1;
  `,

  // Issue task
  insertTaskHistory: `
    INSERT INTO agent_tasking_history (agent_uuid, operator_uuid, task_uuid)
    VALUES ($1, $2, $3)
    RETURNING agent_uuid, operator_uuid, task_uuid, created_at;
  `
};
