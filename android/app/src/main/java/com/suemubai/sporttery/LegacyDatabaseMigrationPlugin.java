package com.suemubai.sporttery;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.channels.FileChannel;

@CapacitorPlugin(name = "LegacyDatabaseMigration")
public class LegacyDatabaseMigrationPlugin extends Plugin {
    @PluginMethod
    public void prepare(PluginCall call) {
        String databaseName = call.getString("databaseName", "caiguo");
        File source = new File(getContext().getFilesDir(), databaseName + ".db");
        File destination = getContext().getDatabasePath(databaseName + "SQLite.db");
        JSObject result = new JSObject();
        result.put("legacyFound", source.isFile());
        result.put("copied", false);
        result.put("sourcePath", source.getAbsolutePath());
        result.put("destinationPath", destination.getAbsolutePath());

        if (!source.isFile()) {
            result.put("reason", "legacy-database-not-found");
            call.resolve(result);
            return;
        }

        result.put("sourceBytes", source.length());
        if (destination.isFile() && destination.length() > 0) {
            result.put("reason", "destination-already-exists");
            call.resolve(result);
            return;
        }

        File parent = destination.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            call.reject("无法创建新数据库目录");
            return;
        }

        try {
            checkpointLegacyWal(source);
            copyFile(source, destination);
            result.put("copied", true);
            result.put("reason", "legacy-database-copied");
            call.resolve(result);
        } catch (Exception error) {
            if (destination.exists() && destination.length() == 0) {
                //noinspection ResultOfMethodCallIgnored
                destination.delete();
            }
            call.reject("旧数据库迁移准备失败", error);
        }
    }

    private void checkpointLegacyWal(File source) {
        SQLiteDatabase database = SQLiteDatabase.openDatabase(
            source.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READWRITE
        );
        try (Cursor cursor = database.rawQuery("PRAGMA wal_checkpoint(FULL)", null)) {
            if (cursor.moveToFirst()) {
                cursor.getInt(0);
            }
        } finally {
            database.close();
        }
    }

    private void copyFile(File source, File destination) throws IOException {
        try (
            FileInputStream input = new FileInputStream(source);
            FileOutputStream output = new FileOutputStream(destination);
            FileChannel inputChannel = input.getChannel();
            FileChannel outputChannel = output.getChannel()
        ) {
            long position = 0;
            long size = inputChannel.size();
            while (position < size) {
                position += inputChannel.transferTo(position, size - position, outputChannel);
            }
            output.getFD().sync();
        }
    }
}
