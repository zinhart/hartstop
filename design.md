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
- agent
  - columns
		- agent_uuid
		- build_uuid
		- type
		- last_seen  (timestamp)
		- created_at (timestamp)
- agent_check_ins
  - columns
		- agent_uuid
  	- created_at (timestamp)
- agent_tasking_history
  - columns
		- agent_uuid
		- operator_uuid
		- tasking_uuid
		- created_at (timestamp)
- agent_configuration
  - columns
		- agent_uuid
		- build_uuid
    - build_configuration
		- created_at (timestamp)
- tasking
  - columns
		- task_uuid
		- task_long_name
		- task_permission
		- created_at (timestamp)
- users
  - columns
    - engagement_uuid
		- username
		- password
		- account_status (enabled/disabled)
		- roles (Analyst, Operator, Admin)
		- created_at (timestamp)
- operators
  - columns
		- engagement_uuid
		- platform(win,lin,osx,net)
		- allowed_tasks (list)
		- created_at (timestamp)
- analyst
  - columns
		- engagement_uuid
		- allowed_tasks (List)
		- created_at (timestamp)
- admin
  - columns
	  - engagement_uuid
	  - allowed_tasks
		- created_at (timestamp)
- last_login
   - columns
    - engagement_uuid
		- created_at (timestamp)
- engagements
  - columns
		- engagement_uuid
		- engagement_name
		- start (timestamp)
		- end (timestamp)
		- created_at (timestamp)
- endpoints
  - columns
		- engagement_uuid
		- os_version
		- build_id
		- ip
		- system_info
		- routing_table
		- arp
		- installed_applications
		- drivers
		- patch_history
		- dirwalk
		- created_at (timestamp)
- dirwalks
	- columns
		- engagement_uuid	
		- files_mtime
		- files_ctime
		- files_atime
		- created_at (timestamp)
=====================================================================
API
	- /api/authenticate
	- /api/task/agent/{task type}
	- /api/agent/task/{agent_id}/
	- /api/agent/task/{agent_id}/history
	- /api/agent/task/{agent_id}/config
	- /api/agent/task/{agent_id}/history
	- /api/agent/build/{type}
	- /api/admin/user/create
	- /api/admin/user/delete
	- /api/admin/user/disable