// Backend half of the Nexa UI plugin: serves dist/ (ES modules) to the editor and to
// deployed pages, and registers it so every deployed page loads it — see
// @kufayeka/node-red-nexa-dashboard/sdk/package.js. The editor side is
// widgets/ui-library-plugin.html.
module.exports = function (RED) {
    require("@kufayeka/node-red-nexa-dashboard/sdk/package")(RED, {
        id: "kufayeka-nexa-component-ui-library",
        name: "nexa-component-ui-library",
        dir: require("path").join(__dirname, "..", "dist"),
        modules: ["ui-library.js"]
    });
    // the Iframe's "does this page allow embedding?" check (editor only)
    require("./embed-check")(RED, "/nexa-component-ui-library/embed-check");
};
