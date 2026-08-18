export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "development-session-secret",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
};
