import { MutationCtx, QueryCtx } from "./_generated/server";

export const requireAuth = async (ctx: MutationCtx | QueryCtx) => {
    const profile = await ctx.auth.getUserIdentity();
    if (!profile) throw new Error("User not found");
    return profile;
}


export const verfiyAuth = async (ctx: MutationCtx | QueryCtx) => {

    const profile = await ctx.auth.getUserIdentity();

    if (!profile) throw new Error('Unauthorized');

    return profile;

}