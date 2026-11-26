// Lets the extensionless imports of convex/lib/search ("./engine") load as .ts files under Node.
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if ((spec.startsWith(".") || spec.startsWith("/")) && !spec.endsWith(".ts")) return next(spec + ".ts", ctx);
    throw e;
  }
}
