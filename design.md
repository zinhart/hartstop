C2 Design and Implant Tracking



db => postgres because I say so
We need to setup automatic mirroring for backend purposes
also a task to periodically dump the database 
=====================================================================

authentication 
	=> @node-oauth/oauth2-server
  => https://github.com/panva/node-oidc-provider   
=====================================================================
Tables
- Agent
  - columns
	- agent id
        - build id
	- type
        - last seen
- Agent Check Ins
  - columns
	- agent id
  	- timestamp
- Agent Tasking History
  - columns
	- agent id
	- operator uuid
	- Tasking ID
- Agent Configuration
  - columns
	- agent id
	- build id
        - build configuration
- Tasking
  - columns
	- Task ID
	- Task Long Name
	- Task Permission
- Users
  - columns
        - uuid
	- username
	- password
	- account status (enabled/disabled)
    	- roles (Watcher(Analyst), Operator, Admin)
- Operators
   - columns
	- uuid
	- platform
	- allowed tasks (list)
- Analyst
   - columns
	- uuid
	- allowed tasks (List)
- Admin
   - columns
	- uuid
	- allowed tasks
- Last Login
   - columns
        - uuid
	- timestamp
- Engagements
   - columns
	- engagement_id
	- engagement_name
- Endpoints
   - columns
	- engagement_id
	- os_version
	- build_id
	- ip
	- system_info
	- routing_table
	- arp
	- software_installed
	- drivers
	- patch_history
=====================================================================
API
 /api/authenticate
 /api/task/agent/{task type}
 /api/agent/task/{agent_id}/
 /api/agent/task/{agent_id}/history
 /api/agent/task/{agent_id}/config
 /api/agent/task/{agent_id}/history
 /api/agent/build/{type}
 /api/admin/user/create
 /api/admin/user/delete
 /api/admin/user/disable