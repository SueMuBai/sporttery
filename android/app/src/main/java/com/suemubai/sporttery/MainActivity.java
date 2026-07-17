package com.suemubai.sporttery;

import android.os.Bundle;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(this));
        }
        PyObject module = Python.getInstance().getModule("mobile_server");
        module.callAttr("start", getFilesDir().getAbsolutePath());
        super.onCreate(savedInstanceState);
    }
}
