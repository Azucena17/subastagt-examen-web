IF DB_ID(N'SubastaGT') IS NULL
BEGIN
    CREATE DATABASE SubastaGT;
END;
GO
USE SubastaGT;
GO
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE dbo.Users (
    Id varchar(64) NOT NULL PRIMARY KEY,
    Email nvarchar(254) NOT NULL UNIQUE,
    FirstName nvarchar(80) NOT NULL,
    LastName nvarchar(80) NOT NULL,
    Phone nvarchar(80) NOT NULL,
    PasswordHash varchar(200) NOT NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.Vehicles', N'U') IS NULL
CREATE TABLE dbo.Vehicles (
    Id varchar(64) NOT NULL PRIMARY KEY,
    OwnerId varchar(64) NOT NULL,
    Document nvarchar(max) NOT NULL CHECK (ISJSON(Document) = 1),
    UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Vehicles_OwnerId' AND object_id = OBJECT_ID('dbo.Vehicles'))
CREATE INDEX IX_Vehicles_OwnerId ON dbo.Vehicles(OwnerId);
IF OBJECT_ID(N'dbo.Bids', N'U') IS NULL
CREATE TABLE dbo.Bids (
    Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    VehicleId varchar(64) NOT NULL REFERENCES dbo.Vehicles(Id),
    UserId varchar(64) NOT NULL REFERENCES dbo.Users(Id),
    AmountCents bigint NOT NULL CHECK (AmountCents > 0),
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
