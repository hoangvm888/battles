const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const fs = require("fs");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const autoprefixer = require("autoprefixer");

// Define the root directory containing the HTML files
const rootDirectory = path.resolve(__dirname, "src");

// Function to generate HtmlWebpackPlugin instances for each HTML file
function generateHtmlPlugins(rootDir) {
  const plugins = [];
  // Read the root directory
  const files = fs.readdirSync(rootDir);

  // Filter HTML Pages files
  const htmlPageFiles = files.filter((file) => path.extname(file) === ".html");
  // Loop through HTML files
  htmlPageFiles.forEach((file) => {
    plugins.push(
      new HtmlWebpackPlugin({
        filename: file,
        template: path.join(rootDir, file),
        inject: "body", // Fix: Change `directory` to `rootDir`
      })
    );
  });

  return plugins;
}

const htmlFiles = generateHtmlPlugins(rootDirectory);

module.exports = {
  entry: {
    main: "./src/assets/js/index.js",
  },
  mode: "development",
  devServer: {
    watchFiles: ["src/**/*"],
    hot: true,
    port: 8080,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        include: path.resolve(__dirname, "src"),
        use: [MiniCssExtractPlugin.loader, "css-loader", "postcss-loader"],
      },
      {
        test: /\.(scss)$/,
        use: [
          {
            // Adds CSS to the DOM by injecting a `<style>` tag
            loader: MiniCssExtractPlugin.loader,
          },
          {
            // Interprets `@import` and `url()` like `import/require()` and will resolve them
            loader: "css-loader",
          },
          {
            // Loader for webpack to process CSS with PostCSS
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                plugins: [autoprefixer],
              },
            },
          },
          {
            // Loads a SASS/SCSS file and compiles it to CSS
            loader: "sass-loader",
          },
        ],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: "asset/resource",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "style.css",
    }),
    new CopyPlugin({
      patterns: [
        { from: "src/assets", to: "assets" },
        { from: "src/manifest.json", to: "manifest.json" },
        // { from: "src/service-worker.js", to: "service-worker.js" },
      ],
    }),
    ...htmlFiles,
  ],
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
};
