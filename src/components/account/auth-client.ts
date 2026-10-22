"use client";

import { createAuthClient } from "better-auth/react";

/** The browser side of Better Auth. Same origin as the app, so no base URL. */
export const authClient = createAuthClient();
