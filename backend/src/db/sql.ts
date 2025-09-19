// src/db/sql.ts
export const SQL = {
  insertUser: `
    INSERT INTO users (username, password_hash, account_status, global_role)
    VALUES ($1, $2, 'enabled', $3::role_enum)
    RETURNING user_uuid, username, account_status, global_role, created_at;
  `,
  disableUser: `UPDATE users SET account_status='disabled' WHERE user_uuid=$1 RETURNING user_uuid;`,
  enableUser:  `UPDATE users SET account_status='enabled'  WHERE user_uuid=$1 RETURNING user_uuid;`,
  deleteUser:  `DELETE FROM users WHERE user_uuid=$1 RETURNING user_uuid;`,

  updateUserGlobalRole: `
    UPDATE users SET global_role=$2::role_enum
    WHERE user_uuid=$1
    RETURNING user_uuid, username, account_status, global_role, created_at;
  `,
};
