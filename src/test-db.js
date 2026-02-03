const prisma = require("./db/prisma");

async function test() {
    const users = await prisma.users.findMany();
    console.log(users);
}

test()
    .catch(console.error)
    .finally(() => process.exit());
