<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateServerConfigRequest;
use App\Models\ServerConfig;
use Illuminate\Http\JsonResponse;

class ServerConfigController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(ServerConfig::all());
    }

    public function update(UpdateServerConfigRequest $request): JsonResponse
    {
        $configs = $request->validated('configs');

        foreach ($configs as $configData) {
            ServerConfig::updateOrCreate(
                ['key' => $configData['key']],
                ['value' => $configData['value']]
            );
        }

        return response()->json(ServerConfig::all());
    }
}
