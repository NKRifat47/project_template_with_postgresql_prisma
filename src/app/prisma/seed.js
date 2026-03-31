import bcrypt from "bcrypt";
import prisma from "./client.js";
import { Role } from "../utils/role.js";

export const seedDatabase = async () => {
  try {
    console.log("Checking for seed data...");

    const passwordHash = await bcrypt.hash("123456", 10);

    const standardUsers = [
      { email: "user1@test.com", name: "User One", role: Role.CUSTOMER },
      { email: "user2@test.com", name: "User Two", role: Role.CUSTOMER },
      { email: "admin@test.com", name: "Admin User", role: Role.SYSTEM_OWNER },
    ];

    let seedCount = 0;

    // Seed Standard Users
    for (const user of standardUsers) {
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });
      if (!existingUser) {
        await prisma.user.create({
          data: {
            email: user.email,
            name: user.name,
            passwordHash: passwordHash,
            role: user.role,
            isVerified: true,
          },
        });
        seedCount++;
        console.log(`✅ Standard user created: ${user.email}`);
      }
    }

    if (seedCount === 0) {
      console.log("ℹ️ Seed data already in database.");
    } else {
      console.log(`✨ Seeding completed. ${seedCount} new users created.`);
    }
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
};
