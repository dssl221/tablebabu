import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "sinhadebojyoti127@gmail.com";
  const newPassword = "debojyoti221@360";
  
  // Hash the new password with bcrypt (cost 12 as per the security policy in the project)
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Update the user in the database
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash }
  });

  // Since the password changed, revoke all active sessions for this user
  await prisma.authSession.deleteMany({
    where: { userId: user.id }
  });

  console.log("Password updated successfully for:", user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
