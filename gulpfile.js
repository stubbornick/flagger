"use strict";

const gulp = require("gulp");
const del = require("del");
const babel = require("gulp-babel");
const cache = require("gulp-cached");
const sourcemaps = require("gulp-sourcemaps");
const plumber = require("gulp-plumber");
const notify = require("gulp-notify");
const gutil = require("gulp-util");

gulp.task("clean", () => del("lib/**/*"));

function build() {
    return gulp.src("src/**/*")
        .pipe(plumber({
            errorHandler: (err) => gutil.log(`${err}\n${err.codeFrame}`)
        }))
        .pipe(sourcemaps.init())
        .pipe(cache("src"))
        .pipe(babel({
            only: /\.js$/,
            plugins: [
                "transform-async-to-generator",
                "transform-es2015-modules-commonjs"
            ]
        }))
        .pipe(sourcemaps.write("."))
        .pipe(notify({ message: "flagger: built", onLast: true }))
        .pipe(gulp.dest("lib"));
}

gulp.task("build", ["clean"], build);

gulp.task("default", ["build"]);

gulp.task("watch", ["build"], () => {
    gulp.watch("src/**/*", build);
});
