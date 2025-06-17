-- CreateTable
CREATE TABLE "TraccarDetail" (
    "id" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "TraccarDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TraccarDetail_id_key" ON "TraccarDetail"("id");

-- CreateIndex
CREATE UNIQUE INDEX "TraccarDetail_userId_key" ON "TraccarDetail"("userId");

-- AddForeignKey
ALTER TABLE "TraccarDetail" ADD CONSTRAINT "TraccarDetail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
