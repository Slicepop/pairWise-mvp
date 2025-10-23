import { useState, useEffect, useRef } from "react";

export default function STDIN_item() {
  return (
    <>
      <input
        type="text"
        placeholder="Input"
        className="p-2 text-gray-200 rounded-xl flex-1 border border-gray-800 bg-gray-700"
      />
      <button
        className=" ml-2 text-lg text-gray-200 font-bold hover:bg-blue-600 hover:text-red-400 rounded-xl transition duration-200
                cursor-pointer bg-blue-000 w-10 border border-gray-800 bg-gray-600 "
      >
        X
      </button>
    </>
  );
}
