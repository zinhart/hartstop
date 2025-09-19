import { Router } from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { GraphQLObjectType, GraphQLSchema, GraphQLString, GraphQLList } from "graphql";
import { q } from "../db";
import { requireRole } from "../auth/rbac";

const AgentType = new GraphQLObjectType({
  name: "Agent",
  fields: {
    agent_uuid: { type: GraphQLString },
    last_seen: { type: GraphQLString },
    platform: { type: GraphQLString }
  }
});

const Query = new GraphQLObjectType({
  name: "Query",
  fields: {
    agentsActive: {
      type: new GraphQLList(AgentType),
      args: { minutes: { type: GraphQLString } },
      resolve: async (_src, { minutes }) => {
        const { rows } = await q(
          `SELECT a.agent_uuid, a.last_seen, ac.platform
           FROM agent_core a JOIN agent_configuration ac ON ac.build_uuid=a.agent_configuration_uuid
           WHERE a.last_seen >= now() - ($1::int || ' minutes')::interval
           ORDER BY a.last_seen DESC`,
          [Number(minutes ?? 5)]
        );
        return rows;
      }
    }
  }
});

const schema = new GraphQLSchema({ query: Query });

const r = Router();
r.post("/api/v1/analytics/graphql", requireRole("Analyst", "Operator", "Admin"),
  createHandler({ schema }));

export default r;
