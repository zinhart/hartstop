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
		- agent_configuration_uuid (reference to the agent configuration table, based on the agent uuid e.g the configuration for this agent)
		- last_seen  (timestamp)
		- created_at (timestamp)
		- uninstall_date (timestamp, the date that the agent will uninstall itself calculated from self_uninstal and created_at timestamps in the agent configuration)
		- agent_configuration (reference to the agent configuration table, based on the build uuid)
- agent_configuration
  - columns
		- build_uuid
    - build_configuration
		- supported_tasking (must be one or more tasks from the tasking table)
		- configured_tasking (the tasking that is support in the current configuration of this agent)
		- platform (e.g win/nix/osx/net)
		- type (trigger/beacon/trigger_beacon)
		- self_uninstall (timestamp, the number of seconds before the agent uninstalls support type are trigger or beacon)
		- checkin_interval (timestamp, checkin interval if type is beacon specified in seconds)
		- load_balancers (can be null e.g no loadbalancers are used OR the first hop in the load balancer)
		- created_at (timestamp)
- agent_check_ins
  - columns
		- agent_uuid
  	- created_at (timestamp)
- agent_tasking_history
  - columns
		- agent_uuid
		- operator_uuid
		- tasking_uuid (insert fails if there is not a valid task from the tasking table)
		- created_at (timestamp)
- tasking
  - columns
		- task_uuid
		- task_long_name
		- task_permission (must be a role from the users table)
		- created_at (timestamp)
- load_balancers
	- columns
		- load_balancers_uuid
		- engagement_uuid (can be null)
		- first_hop (can be an ip or a domain)
		- second_hop (can be an ip or a domain)
		- third_hop (can be an ip or a domain)
		- last_hop (can be an ip or a domain)
- users
  - columns
		- user_uuid
    - engagement_uuid (a list of engagements this user has participated in)
		- username
		- password
		- account_status (enabled/disabled)
		- roles (Analyst, Operator, Admin)
		- created_at (timestamp)
- operators
  - columns
		- operator_uuid
		- engagement_uuid
		- platform(win,lin,osx,net)
		- allowed_tasks (list)
		- created_at (timestamp)
- analyst
  - columns
		- analyst_uuid
		- engagement_uuid
		- allowed_tasks (List)
		- created_at (timestamp)
- admin
  - columns
		- admin_uuid
	  - engagement_uuid
	  - allowed_tasks
		- created_at (timestamp)
- last_login
  - columns
    - user_uuid
		- created_at (timestamp)
- engagements
  - columns
		- engagement_uuid
		- engagement_name
		- users_uuid (1 or more users)
		- start (timestamp)
		- end (timestamp)
		- created_at (timestamp)
- endpoints
  - columns
		- endpoint_uuid
		- engagement_uuid
		- agent_uuid
		- os_version
		- ip (inet one or more ip addresses)
		- system_info
		- gateway (inet one or more gateway ip's)
		- routing_table
		- arp
		- installed_applications
		- drivers
		- patch_history
		- dirwalk (reference to diwalk table based engagement_uuid and agent_uuid)
		- created_at (timestamp)
- dirwalks
	- columns
		- dirwalk_uuid
		- engagement_uuid	
		- agent_uuid
		- endpoint_uuid
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