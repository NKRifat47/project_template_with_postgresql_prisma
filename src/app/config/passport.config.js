import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";


import bcrypt from "bcrypt";
import prisma from "../prisma/client.js";
import { envVars } from "../config/env.js";

passport.use(
    new LocalStrategy(
        {
            usernameField: "email",
            passwordField: "password",
        },
        async (email, password, done) => {
            try {
                const user = await prisma.user.findUnique({
                    where: { email },
                });

                if (!user) {
                    return done(null, false, { message: "Incorrect email." });
                }

                if (!user.passwordHash) {
                    return done(null, false, {
                        message: "Please login with your social account.",
                    });
                }

                const isMatch = await bcrypt.compare(password, user.passwordHash);

                if (!isMatch) {
                    return done(null, false, { message: "Incorrect password." });
                }

                if (!user.isVerified) {
                    return done(null, false, {
                        message: "User is not verified. Please verify your email.",
                    });
                }

                return done(null, user);
            } catch (err) {
                return done(err);
            }
        }
    )
);

// Optional: Serialize/Deserialize if sessions are used (not strictly needed for JWT but good to have)

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({ where: { id } });
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});
