import android.app.UiAutomation;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.graphics.Rect;
import java.io.*;
import java.util.List;

public class FastDump {
    public static void main(String[] args) {
        String outPath = args.length > 0 ? args[0] : "/sdcard/window_dump.xml";
        try {
            Class<?> wrapperClass = Class.forName("com.android.uiautomator.core.UiAutomationShellWrapper");
            Object wrapper = wrapperClass.getDeclaredConstructor().newInstance();
            wrapperClass.getMethod("connect").invoke(wrapper);

            UiAutomation ui = (UiAutomation) wrapperClass.getMethod("getUiAutomation").invoke(wrapper);
            
            // Retry for up to 2 seconds for active window or windows list
            AccessibilityNodeInfo root = null;
            for (int r = 0; r < 20; r++) {
                root = ui.getRootInActiveWindow();
                if (root != null) break;
                
                try {
                    List<AccessibilityWindowInfo> windows = ui.getWindows();
                    if (windows != null && !windows.isEmpty()) {
                        for (AccessibilityWindowInfo w : windows) {
                            if (w.getType() == AccessibilityWindowInfo.TYPE_APPLICATION) {
                                root = w.getRoot();
                                if (root != null) break;
                            }
                        }
                        if (root == null && windows.size() > 0) {
                            root = windows.get(windows.size() - 1).getRoot();
                        }
                    }
                } catch (Throwable ignored) {}
                
                if (root != null) break;
                Thread.sleep(100);
            }

            if (root == null) {
                System.err.println("ERROR: could not get root node");
                try { wrapperClass.getMethod("disconnect").invoke(wrapper); } catch (Exception ignored) {}
                System.exit(1);
            }

            File outFile = new File(outPath);
            File parent = outFile.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }

            PrintWriter writer = new PrintWriter(new OutputStreamWriter(new FileOutputStream(outFile), "UTF-8"));
            writer.print("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>");
            writer.print("<hierarchy rotation=\"0\">");
            dumpNode(root, writer, 0);
            writer.print("</hierarchy>");
            writer.flush();
            writer.close();

            try { wrapperClass.getMethod("disconnect").invoke(wrapper); } catch (Exception ignored) {}
            System.out.println("FastDump success: " + outPath);
        } catch (Throwable t) {
            t.printStackTrace(System.err);
            System.exit(2);
        }
    }

    private static void dumpNode(AccessibilityNodeInfo node, PrintWriter w, int index) {
        if (node == null) return;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        String boundsStr = "[" + bounds.left + "," + bounds.top + "][" + bounds.right + "," + bounds.bottom + "]";
        
        w.print("<node");
        w.print(" index=\"" + index + "\"");
        w.print(" text=\"" + escapeXml(node.getText()) + "\"");
        w.print(" resource-id=\"" + escapeXml(node.getViewIdResourceName()) + "\"");
        w.print(" class=\"" + escapeXml(node.getClassName()) + "\"");
        w.print(" package=\"" + escapeXml(node.getPackageName()) + "\"");
        w.print(" content-desc=\"" + escapeXml(node.getContentDescription()) + "\"");
        w.print(" checkable=\"" + node.isCheckable() + "\"");
        w.print(" checked=\"" + node.isChecked() + "\"");
        w.print(" clickable=\"" + node.isClickable() + "\"");
        w.print(" enabled=\"" + node.isEnabled() + "\"");
        w.print(" focusable=\"" + node.isFocusable() + "\"");
        w.print(" focused=\"" + node.isFocused() + "\"");
        w.print(" scrollable=\"" + node.isScrollable() + "\"");
        w.print(" long-clickable=\"" + node.isLongClickable() + "\"");
        w.print(" password=\"" + node.isPassword() + "\"");
        w.print(" selected=\"" + node.isSelected() + "\"");
        w.print(" bounds=\"" + boundsStr + "\"");

        int childCount = node.getChildCount();
        if (childCount == 0) {
            w.print(" />");
        } else {
            w.print(">");
            for (int i = 0; i < childCount; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                dumpNode(child, w, i);
                if (child != null) child.recycle();
            }
            w.print("</node>");
        }
    }

    private static String escapeXml(CharSequence cs) {
        if (cs == null) return "";
        String s = cs.toString();
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
}
