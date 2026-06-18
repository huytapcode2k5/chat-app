const sql = require("mssql");
require("dotenv").config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

let pool = null;

async function connectDB() {
    try {
        pool = await sql.connect(config);
        console.log("✅ Kết nối SQL Server thành công");

        // Tự động thêm cột IsAdmin nếu chưa có
        try {
            await pool.request().query(`
                IF NOT EXISTS (
                    SELECT * FROM sys.columns 
                    WHERE object_id = OBJECT_ID('Users') AND name = 'IsAdmin'
                )
                BEGIN
                    ALTER TABLE Users ADD IsAdmin BIT NOT NULL DEFAULT 0;
                    PRINT 'Đã thêm cột IsAdmin vào bảng Users';
                END
            `);

            // Cập nhật user 'admin' thành admin (nếu tồn tại)
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM Users WHERE Username = 'admin')
                    UPDATE Users SET IsAdmin = 1 WHERE Username = 'admin'
            `);

            console.log("✅ Đã kiểm tra và cấu hình cột IsAdmin");
        } catch (err) {
            console.warn("⚠️ Không thể thêm/cập nhật cột IsAdmin:", err.message);
        }

        // Tự động thêm cột RoleName vào ConversationMembers nếu chưa có
        try {
            await pool.request().query(`
                IF NOT EXISTS (
                    SELECT * FROM sys.columns
                    WHERE object_id = OBJECT_ID('ConversationMembers') AND name = 'RoleName'
                )
                BEGIN
                    ALTER TABLE ConversationMembers ADD RoleName NVARCHAR(20) NOT NULL DEFAULT 'Member';
                    PRINT 'Đã thêm cột RoleName vào ConversationMembers';
                END
            `);
            console.log("✅ Đã kiểm tra và cấu hình cột RoleName");
        } catch (err) {
            console.warn("⚠️ Không thể thêm cột RoleName:", err.message);
        }

        // Tự động thêm bảng BlockedUsers nếu chưa có
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BlockedUsers')
                BEGIN
                    CREATE TABLE BlockedUsers (
                        BlockerID INT NOT NULL,
                        BlockedID INT NOT NULL,
                        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
                        CONSTRAINT PK_BlockedUsers PRIMARY KEY (BlockerID, BlockedID),
                        CONSTRAINT FK_BlockedUsers_Blocker FOREIGN KEY (BlockerID) REFERENCES Users(UserID),
                        CONSTRAINT FK_BlockedUsers_Blocked FOREIGN KEY (BlockedID) REFERENCES Users(UserID)
                    );
                    PRINT 'Đã tạo bảng BlockedUsers';
                END
            `);
            console.log("✅ Đã kiểm tra bảng BlockedUsers");
        } catch (err) {
            console.warn("⚠️ Không thể tạo bảng BlockedUsers:", err.message);
        }

        return pool;
    } catch (err) {
        console.error("❌ Lỗi database:", err);
        process.exit(1);
    }
}

function getPool() {
    if (!pool) {
        throw new Error("Chưa kết nối database");
    }
    return pool;
}

module.exports = {
    connectDB,
    getPool
};